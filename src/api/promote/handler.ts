import type { WriteAuditInput } from '../../../packages/utils/src/audit.js';
import { ActionType } from '../../../packages/types/src/audit.js';

// ── Minimal API Gateway types (local, matching environments/handler.ts pattern) ──

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

// ── Domain types ──

export interface WorkflowRecord {
  workflowId: string;
  tenantId: string;
  name: string;
  environmentId: string;
  status: string;
  createdBy: string;
}

export interface WorkflowVersionRecord {
  workflowId: string;
  version: string;
  compiledPlan: Record<string, unknown>;
}

export interface PromoteRepository {
  getWorkflow(tenantId: string, workflowId: string): Promise<WorkflowRecord | null>;
  getLatestVersion(workflowId: string): Promise<WorkflowVersionRecord | null>;
  createWorkflow(record: WorkflowRecord): Promise<void>;
  createVersion(record: WorkflowVersionRecord): Promise<void>;
}

// ── Response helpers ──

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

function getHeader(headers: Record<string, string> | null | undefined, key: string): string | null {
  if (!headers) return null;
  const match = Object.entries(headers).find(
    ([header]) => header.toLowerCase() === key.toLowerCase(),
  );
  return match ? match[1] : null;
}

// ── Handler factory ──

export function createPromoteHandler(
  repo: PromoteRepository,
  auditClient: { write: (entry: WriteAuditInput) => Promise<void> },
): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult> {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    // 1. Extract tenantId
    const tenantId = getHeader(event.headers, 'x-tenant-id');
    if (!tenantId) {
      return jsonResponse(400, { message: 'Missing x-tenant-id header' });
    }

    // 2. Extract workflowId from path parameters
    const workflowId = event.pathParameters?.workflowId;
    if (!workflowId) {
      return jsonResponse(400, { message: 'Missing workflowId path parameter' });
    }

    // 3. Fetch workflow and verify tenant ownership
    const workflow = await repo.getWorkflow(tenantId, workflowId);
    if (!workflow) {
      return jsonResponse(404, { message: 'Workflow not found' });
    }

    // 4. Check environment is dev
    if (workflow.environmentId !== 'dev') {
      return jsonResponse(400, { message: 'Only dev workflows can be promoted' });
    }

    // 5. Check status is PUBLISHED
    if (workflow.status !== 'PUBLISHED') {
      return jsonResponse(400, { message: 'Only published workflows can be promoted' });
    }

    // 6. Get latest version
    const latestVersion = await repo.getLatestVersion(workflowId);

    // 7. Generate new workflowId
    const newWorkflowId = crypto.randomUUID();

    // 8. Create new prod workflow record
    await repo.createWorkflow({
      workflowId: newWorkflowId,
      tenantId,
      name: workflow.name,
      environmentId: 'prod',
      status: 'DRAFT',
      createdBy: workflow.createdBy,
    });

    // 9. Create new version record with source compiledPlan
    await repo.createVersion({
      workflowId: newWorkflowId,
      version: latestVersion?.version ?? '1.0.0',
      compiledPlan: latestVersion?.compiledPlan ?? {},
    });

    // 10. Write WORKFLOW_PROMOTED audit entry
    await auditClient.write({
      tenantId,
      actor: workflow.createdBy,
      actorEmail: '',
      actionType: ActionType.WORKFLOW_PROMOTED,
      resourceType: 'workflow',
      resourceId: newWorkflowId,
      detail: {
        sourceWorkflowId: workflowId,
        targetWorkflowId: newWorkflowId,
      },
      ipAddress: getHeader(event.headers, 'x-forwarded-for') ?? '',
      userAgent: getHeader(event.headers, 'user-agent') ?? '',
    });

    // 11. Return 201 with new workflow info
    return jsonResponse(201, {
      newWorkflowId,
      environmentId: 'prod',
      status: 'DRAFT',
    });
  };
}
