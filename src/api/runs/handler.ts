import type { Run, RunStep } from '../../../packages/types/src/runs';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from '../triggers/shared';
import { jsonResponse, resolveTenantId } from '../triggers/shared';
import { validateRunsQueryParams, encodeCursor } from './validation';
import type { RunsQueryParams } from './validation';

export interface RunsResponse {
  runs: Run[];
  nextCursor?: string;
}

export interface RunRepository {
  queryByTenant(tenantId: string, params: RunsQueryParams): Promise<{ items: Run[]; lastKey?: Record<string, unknown> }>;
  queryByWorkflow(tenantId: string, workflowId: string, params: RunsQueryParams): Promise<{ items: Run[]; lastKey?: Record<string, unknown> }>;
  queryByTenantStatus(tenantId: string, status: string, params: RunsQueryParams): Promise<{ items: Run[]; lastKey?: Record<string, unknown> }>;
  getById(tenantId: string, runId: string): Promise<Run | null>;
  getSteps(runId: string): Promise<RunStep[]>;
}

export function createRunsHandler(repo: RunRepository) {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const tenantId = resolveTenantId(event);
    if (tenantId === null) {
      return jsonResponse(400, { message: 'Missing x-tenant-id header' });
    }

    const raw: Record<string, string | undefined> = event.queryStringParameters ?? {};
    const validation = validateRunsQueryParams(raw);
    if (!validation.valid) {
      return jsonResponse(400, { message: validation.errors.join(', ') });
    }

    const params = validation.parsed;

    let result: { items: Run[]; lastKey?: Record<string, unknown> };

    if (params.workflowId !== undefined) {
      result = await repo.queryByWorkflow(tenantId, params.workflowId, params);
    } else if (params.status !== undefined) {
      result = await repo.queryByTenantStatus(tenantId, params.status, params);
    } else {
      result = await repo.queryByTenant(tenantId, params);
    }

    const response: RunsResponse = { runs: result.items };
    if (result.lastKey !== undefined) {
      response.nextCursor = encodeCursor(result.lastKey);
    }

    return jsonResponse(200, response);
  };
}
