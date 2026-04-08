/**
 * V1 Workflow handler.
 *
 * POST   /api/v1/workflows              — create a new workflow
 * GET    /api/v1/workflows              — list workflows (with optional filters)
 * GET    /api/v1/workflows/:workflowId  — get workflow detail
 * POST   /api/v1/workflows/:workflowId/publish — publish a workflow
 *
 * Thin adapter that validates input, delegates to the repository, and masks
 * sensitive data (compiledPlan) from responses.
 */

import { randomUUID } from 'node:crypto';

// ── Minimal API Gateway types (matching existing pattern) ──

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

// ── Repository interfaces ──

export interface V1WorkflowRecord {
  workflowId: string;
  versionId: string;
  tenantId: string;
  name: string;
  recipeId: string;
  status: string;
  environmentId: string;
  connectionIds: string[];
  params: Record<string, unknown>;
  compiledPlan?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface V1WorkflowRepository {
  create(workflow: V1WorkflowRecord): Promise<void>;
  list(tenantId: string): Promise<V1WorkflowRecord[]>;
  getById(tenantId: string, workflowId: string): Promise<V1WorkflowRecord | null>;
  publish(tenantId: string, workflowId: string): Promise<V1WorkflowRecord | null>;
}

// ── Helpers ──

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

/**
 * Strip `compiledPlan` from a workflow record so secrets are never exposed.
 */
function stripCompiledPlan(
  record: V1WorkflowRecord,
): Omit<V1WorkflowRecord, 'compiledPlan'> {
  const { compiledPlan: _ignored, ...rest } = record;
  return rest;
}

// ── Input validation ──

export interface WorkflowCreateBody {
  name: string;
  recipeId: string;
  params: Record<string, unknown>;
  environmentId: string;
  connectionIds: string[];
}

/**
 * Validate the create-workflow request body.
 * Returns a descriptive error string or `null` when valid.
 */
export function validateCreateBody(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return 'Request body must be a JSON object';
  }

  const record = body as Record<string, unknown>;

  if (typeof record.name !== 'string' || record.name.trim() === '') {
    return 'name is required and must be a non-empty string';
  }
  if (typeof record.recipeId !== 'string' || record.recipeId.trim() === '') {
    return 'recipeId is required and must be a non-empty string';
  }
  if (typeof record.params !== 'object' || record.params === null || Array.isArray(record.params)) {
    return 'params is required and must be an object';
  }
  if (typeof record.environmentId !== 'string' || record.environmentId.trim() === '') {
    return 'environmentId is required and must be a non-empty string';
  }
  if (
    !Array.isArray(record.connectionIds) ||
    record.connectionIds.some((id) => typeof id !== 'string')
  ) {
    return 'connectionIds is required and must be an array of strings';
  }

  return null;
}

// ── Handler factory ──

export function createV1WorkflowHandler(repo: V1WorkflowRepository) {
  return {
    /**
     * POST /api/v1/workflows
     */
    async create(
      tenantId: string,
      body: unknown,
    ): Promise<APIGatewayProxyResult> {
      const validationError = validateCreateBody(body);
      if (validationError) {
        return jsonResponse(400, { error: validationError });
      }

      const { name, recipeId, params, environmentId, connectionIds } =
        body as WorkflowCreateBody;

      const now = new Date().toISOString();
      const workflowId = randomUUID();
      const versionId = randomUUID();

      const record: V1WorkflowRecord = {
        workflowId,
        versionId,
        tenantId,
        name,
        recipeId,
        status: 'DRAFT',
        environmentId,
        connectionIds,
        params,
        createdAt: now,
        updatedAt: now,
      };

      await repo.create(record);

      return jsonResponse(201, { workflowId, versionId, status: 'DRAFT' });
    },

    /**
     * GET /api/v1/workflows
     */
    async list(
      tenantId: string,
      query?: Record<string, string | undefined>,
    ): Promise<APIGatewayProxyResult> {
      const workflows = await repo.list(tenantId);

      let filtered = workflows;
      const statusFilter = query?.status;
      const envFilter = query?.environmentId;

      if (statusFilter) {
        filtered = filtered.filter((w) => w.status === statusFilter);
      }
      if (envFilter) {
        filtered = filtered.filter((w) => w.environmentId === envFilter);
      }

      const masked = filtered.map(stripCompiledPlan);
      return jsonResponse(200, { workflows: masked });
    },

    /**
     * GET /api/v1/workflows/:workflowId
     */
    async getById(
      tenantId: string,
      workflowId: string,
    ): Promise<APIGatewayProxyResult> {
      const workflow = await repo.getById(tenantId, workflowId);
      if (!workflow) {
        return jsonResponse(404, { error: 'Not found' });
      }

      return jsonResponse(200, stripCompiledPlan(workflow));
    },

    /**
     * POST /api/v1/workflows/:workflowId/publish
     */
    async publish(
      tenantId: string,
      workflowId: string,
    ): Promise<APIGatewayProxyResult> {
      const updated = await repo.publish(tenantId, workflowId);
      if (!updated) {
        return jsonResponse(404, { error: 'Not found' });
      }

      return jsonResponse(200, stripCompiledPlan(updated));
    },
  };
}
