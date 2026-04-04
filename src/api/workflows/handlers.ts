import { randomUUID } from 'node:crypto';

import { compilePlan, type Connection, type Recipe, type StepDefinition } from '../../../packages/utils/src/compile-plan.js';
import { bumpMinor, compareSemver } from '../../../packages/utils/src/semver.js';

export type WorkflowStatus = 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'ARCHIVED';

export interface WorkflowRecord {
  PK: string;
  SK: string;
  workflowId: string;
  tenantId: string;
  name: string;
  description: string;
  recipeId: string;
  status: WorkflowStatus;
  currentVersionId: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  connectionIds: string[];
  environmentId: 'dev' | 'prod';
}

export interface WorkflowVersionRecord {
  PK: string;
  SK: string;
  versionId: string;
  workflowId: string;
  semver: string;
  compiledPlan: StepDefinition[];
  createdBy: string;
  createdAt: string;
  recipeId: string;
  paramSnapshot: Record<string, unknown>;
}

export interface APIGatewayProxyEvent {
  httpMethod: string;
  path: string;
  pathParameters?: Record<string, string> | null;
  queryStringParameters?: Record<string, string> | null;
  headers?: Record<string, string> | null;
  body?: string | null;
}

export interface APIGatewayProxyResult {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

interface WorkflowSummary {
  workflowId: string;
  tenantId: string;
  name: string;
  description: string;
  recipeId: string;
  status: WorkflowStatus;
  currentVersionId: string;
  updatedAt: string;
  environmentId: 'dev' | 'prod';
}

export interface WorkflowRepository {
  createWorkflow(workflow: WorkflowRecord): Promise<void>;
  updateWorkflow(workflow: WorkflowRecord): Promise<void>;
  getWorkflow(tenantId: string, workflowId: string): Promise<WorkflowRecord | null>;
  listWorkflows(tenantId: string): Promise<WorkflowRecord[]>;
  createVersion(version: WorkflowVersionRecord): Promise<void>;
  getVersion(workflowId: string, semver: string): Promise<WorkflowVersionRecord | null>;
  listVersions(workflowId: string): Promise<WorkflowVersionRecord[]>;
}

export interface ConnectionRepository {
  listByIds(tenantId: string, connectionIds: string[]): Promise<Connection[]>;
}

export interface RecipeRegistry {
  getById(recipeId: string): Recipe | null;
}

export interface TriggerRepository {
  hasWebhookSecret(tenantId: string, workflowId: string): Promise<boolean>;
  hasEnabledSchedule(workflowId: string): Promise<boolean>;
  disableSchedules(workflowId: string): Promise<void>;
}

export interface AuditRepository {
  write(entry: {
    tenantId: string;
    workflowId: string;
    actionType: 'WORKFLOW_PUBLISHED' | 'WORKFLOW_PAUSED' | 'WORKFLOW_ARCHIVED';
    actor: string;
    timestamp: string;
  }): Promise<void>;
}

export interface EventBridgePublisher {
  putEvent(input: {
    source: 'courseforge.workflow';
    detailType: 'WorkflowPublished';
    detail: { tenantId: string; workflowId: string; versionId: string };
  }): Promise<void>;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

function parseJsonObject(event: APIGatewayProxyEvent): Record<string, unknown> | APIGatewayProxyResult {
  if (!event.body) {
    return jsonResponse(400, { message: 'Request body is required' });
  }

  try {
    const parsed = JSON.parse(event.body);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return jsonResponse(400, { message: 'Request body must be a JSON object' });
    }
    return parsed as Record<string, unknown>;
  } catch {
    return jsonResponse(400, { message: 'Invalid JSON in request body' });
  }
}

function resolveTenantId(event: APIGatewayProxyEvent, body?: Record<string, unknown>): string | null {
  const tenantId = event.headers?.['x-tenant-id'] ?? event.headers?.['X-Tenant-Id'] ?? body?.tenantId;
  return typeof tenantId === 'string' && tenantId.trim() !== '' ? tenantId.trim() : null;
}

function actor(event: APIGatewayProxyEvent): string {
  return event.headers?.['x-actor'] ?? event.headers?.['X-Actor'] ?? 'system';
}

function isApiResult(value: unknown): value is APIGatewayProxyResult {
  return typeof value === 'object' && value !== null && 'statusCode' in value;
}

function ensureActiveConnections(connections: Connection[], expectedCount: number): string | null {
  if (connections.length !== expectedCount) {
    return 'One or more connections were not found';
  }

  const inactive = connections.find((connection) => connection.status !== 'active');
  return inactive ? `Connection ${inactive.connectionId} is not active` : null;
}

function summarizeSteps(steps: StepDefinition[]): string[] {
  return steps.map((step) => step.name);
}

export function createCreateWorkflowHandler(
  workflowRepo: WorkflowRepository,
  connectionRepo: ConnectionRepository,
  recipeRegistry: RecipeRegistry,
) {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const body = parseJsonObject(event);
    if (isApiResult(body)) {
      return body;
    }

    const tenantId = resolveTenantId(event, body);
    if (!tenantId) {
      return jsonResponse(400, { message: 'tenantId is required' });
    }

    const { name, description = '', recipeId, params = {}, environmentId, connectionIds = [] } = body;
    if (typeof name !== 'string' || name.trim() === '') {
      return jsonResponse(400, { message: 'name is required' });
    }
    if (typeof recipeId !== 'string' || recipeId.trim() === '') {
      return jsonResponse(400, { message: 'recipeId is required' });
    }
    if (environmentId !== 'dev' && environmentId !== 'prod') {
      return jsonResponse(400, { message: 'environmentId must be dev or prod' });
    }
    if (!Array.isArray(connectionIds) || connectionIds.some((id) => typeof id !== 'string')) {
      return jsonResponse(400, { message: 'connectionIds must be an array of strings' });
    }

    const recipe = recipeRegistry.getById(recipeId);
    if (!recipe) {
      return jsonResponse(400, { message: 'Unknown recipeId' });
    }

    const uniqueConnectionIds = [...new Set(connectionIds as string[])];
    const connections = await connectionRepo.listByIds(tenantId, uniqueConnectionIds);
    const connectionError = ensureActiveConnections(connections, uniqueConnectionIds.length);
    if (connectionError) {
      return jsonResponse(400, { message: connectionError });
    }

    let compiledPlan: StepDefinition[];
    try {
      compiledPlan = compilePlan(recipe, params as Record<string, unknown>, connections);
    } catch (error) {
      if (error instanceof Error) {
        return jsonResponse(400, { message: error.message });
      }
      return jsonResponse(400, { message: 'Failed to compile workflow plan' });
    }

    const now = new Date().toISOString();
    const workflowId = randomUUID();
    const versionId = randomUUID();

    const workflow: WorkflowRecord = {
      PK: `TENANT#${tenantId}`,
      SK: `WORKFLOW#${workflowId}`,
      workflowId,
      tenantId,
      name,
      description: typeof description === 'string' ? description : '',
      recipeId,
      status: 'DRAFT',
      currentVersionId: versionId,
      createdAt: now,
      updatedAt: now,
      createdBy: actor(event),
      connectionIds: uniqueConnectionIds,
      environmentId,
    };

    const version: WorkflowVersionRecord = {
      PK: `WORKFLOW#${workflowId}`,
      SK: 'VERSION#0.1.0',
      versionId,
      workflowId,
      semver: '0.1.0',
      compiledPlan,
      createdBy: actor(event),
      createdAt: now,
      recipeId,
      paramSnapshot: params as Record<string, unknown>,
    };

    await workflowRepo.createWorkflow(workflow);
    await workflowRepo.createVersion(version);

    return jsonResponse(201, { workflowId, versionId, status: 'DRAFT' });
  };
}

export function createListWorkflowsHandler(workflowRepo: WorkflowRepository) {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const tenantId = resolveTenantId(event);
    if (!tenantId) {
      return jsonResponse(400, { message: 'tenantId is required' });
    }

    const statusFilter = event.queryStringParameters?.status;
    const environmentFilter = event.queryStringParameters?.environmentId;

    const workflows = await workflowRepo.listWorkflows(tenantId);
    const filtered = workflows.filter((workflow) => {
      if (statusFilter && workflow.status !== statusFilter) {
        return false;
      }
      if (environmentFilter && workflow.environmentId !== environmentFilter) {
        return false;
      }
      return true;
    });

    return jsonResponse(200, { workflows: filtered });
  };
}

export function createGetWorkflowHandler(workflowRepo: WorkflowRepository) {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const tenantId = resolveTenantId(event);
    const workflowId = event.pathParameters?.workflowId;
    if (!tenantId || !workflowId) {
      return jsonResponse(400, { message: 'tenantId and workflowId are required' });
    }

    const workflow = await workflowRepo.getWorkflow(tenantId, workflowId);
    if (!workflow) {
      return jsonResponse(404, { message: 'Workflow not found' });
    }

    const versions = await workflowRepo.listVersions(workflowId);
    const currentVersion = versions.find((version) => version.versionId === workflow.currentVersionId);

    return jsonResponse(200, {
      workflow,
      currentVersionSummary: currentVersion ? summarizeSteps(currentVersion.compiledPlan) : [],
    });
  };
}

export function createPublishWorkflowHandler(
  workflowRepo: WorkflowRepository,
  connectionRepo: ConnectionRepository,
  triggerRepo: TriggerRepository,
  auditRepo: AuditRepository,
  eventBridge: EventBridgePublisher,
) {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const tenantId = resolveTenantId(event);
    const workflowId = event.pathParameters?.workflowId;
    if (!tenantId || !workflowId) {
      return jsonResponse(400, { message: 'tenantId and workflowId are required' });
    }

    const workflow = await workflowRepo.getWorkflow(tenantId, workflowId);
    if (!workflow) {
      return jsonResponse(404, { message: 'Workflow not found' });
    }
    if (workflow.status === 'PUBLISHED') {
      return jsonResponse(409, { message: 'Workflow is already published' });
    }

    const versions = await workflowRepo.listVersions(workflowId);
    const currentVersion = versions.find((version) => version.versionId === workflow.currentVersionId);
    if (!currentVersion) {
      return jsonResponse(404, { message: 'Current workflow version not found' });
    }

    const connections = await connectionRepo.listByIds(tenantId, workflow.connectionIds);
    const connectionError = ensureActiveConnections(connections, workflow.connectionIds.length);
    if (connectionError) {
      return jsonResponse(400, { message: connectionError });
    }

    for (const step of currentVersion.compiledPlan) {
      const triggerType = step.params.triggerType;
      if (triggerType === 'webhook') {
        const hasSecret = await triggerRepo.hasWebhookSecret(tenantId, workflowId);
        if (!hasSecret) {
          return jsonResponse(400, { message: 'Webhook trigger requires a webhook secret' });
        }
      }
      if (triggerType === 'scheduled') {
        const hasSchedule = await triggerRepo.hasEnabledSchedule(workflowId);
        if (!hasSchedule) {
          return jsonResponse(400, { message: 'Scheduled trigger requires an enabled schedule' });
        }
      }
    }

    const nextSemver = bumpMinor(currentVersion.semver);
    const now = new Date().toISOString();
    const versionId = randomUUID();
    const newVersion: WorkflowVersionRecord = {
      ...currentVersion,
      PK: `WORKFLOW#${workflowId}`,
      SK: `VERSION#${nextSemver}`,
      semver: nextSemver,
      versionId,
      createdAt: now,
      createdBy: actor(event),
    };

    const updatedWorkflow: WorkflowRecord = {
      ...workflow,
      status: 'PUBLISHED',
      currentVersionId: versionId,
      updatedAt: now,
    };

    await workflowRepo.createVersion(newVersion);
    await workflowRepo.updateWorkflow(updatedWorkflow);

    await eventBridge.putEvent({
      source: 'courseforge.workflow',
      detailType: 'WorkflowPublished',
      detail: { tenantId, workflowId, versionId },
    });

    await auditRepo.write({
      tenantId,
      workflowId,
      actionType: 'WORKFLOW_PUBLISHED',
      actor: actor(event),
      timestamp: now,
    });

    return jsonResponse(200, { workflowId, versionId, status: 'PUBLISHED' });
  };
}

async function updateStatus(
  event: APIGatewayProxyEvent,
  workflowRepo: WorkflowRepository,
  triggerRepo: TriggerRepository,
  auditRepo: AuditRepository,
  status: 'PAUSED' | 'ARCHIVED',
): Promise<APIGatewayProxyResult> {
  const tenantId = resolveTenantId(event);
  const workflowId = event.pathParameters?.workflowId;
  if (!tenantId || !workflowId) {
    return jsonResponse(400, { message: 'tenantId and workflowId are required' });
  }

  const workflow = await workflowRepo.getWorkflow(tenantId, workflowId);
  if (!workflow) {
    return jsonResponse(404, { message: 'Workflow not found' });
  }

  if (status === 'PAUSED' && workflow.status !== 'PUBLISHED') {
    return jsonResponse(409, { message: 'Only published workflows can be paused' });
  }

  if (status === 'ARCHIVED' && workflow.status === 'PUBLISHED') {
    return jsonResponse(409, { message: 'Pause the workflow before archiving' });
  }

  if (status === 'PAUSED') {
    await triggerRepo.disableSchedules(workflowId);
  }

  const now = new Date().toISOString();
  await workflowRepo.updateWorkflow({ ...workflow, status, updatedAt: now });
  await auditRepo.write({
    tenantId,
    workflowId,
    actionType: status === 'PAUSED' ? 'WORKFLOW_PAUSED' : 'WORKFLOW_ARCHIVED',
    actor: actor(event),
    timestamp: now,
  });

  return jsonResponse(200, { workflowId, status });
}

export function createPauseWorkflowHandler(
  workflowRepo: WorkflowRepository,
  triggerRepo: TriggerRepository,
  auditRepo: AuditRepository,
) {
  return (event: APIGatewayProxyEvent) =>
    updateStatus(event, workflowRepo, triggerRepo, auditRepo, 'PAUSED');
}

export function createArchiveWorkflowHandler(
  workflowRepo: WorkflowRepository,
  triggerRepo: TriggerRepository,
  auditRepo: AuditRepository,
) {
  return (event: APIGatewayProxyEvent) =>
    updateStatus(event, workflowRepo, triggerRepo, auditRepo, 'ARCHIVED');
}

export function createListWorkflowVersionsHandler(workflowRepo: WorkflowRepository) {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const workflowId = event.pathParameters?.workflowId;
    if (!workflowId) {
      return jsonResponse(400, { message: 'workflowId is required' });
    }

    const versions = await workflowRepo.listVersions(workflowId);
    const metadataOnly = versions
      .sort((a, b) => compareSemver(b.semver, a.semver))
      .map((version) => ({
        versionId: version.versionId,
        workflowId: version.workflowId,
        semver: version.semver,
        createdBy: version.createdBy,
        createdAt: version.createdAt,
        recipeId: version.recipeId,
      }));

    return jsonResponse(200, { versions: metadataOnly });
  };
}
