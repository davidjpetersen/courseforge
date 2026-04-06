import type { Run, RunStep } from '../../../packages/types/src/runs.js';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from '../triggers/shared.js';
import type { RunsQueryParams } from './validation.js';
export interface RunsResponse {
    runs: Run[];
    nextCursor?: string;
}
export interface RunRepository {
    queryByTenant(tenantId: string, params: RunsQueryParams): Promise<{
        items: Run[];
        lastKey?: Record<string, unknown>;
    }>;
    queryByWorkflow(tenantId: string, workflowId: string, params: RunsQueryParams): Promise<{
        items: Run[];
        lastKey?: Record<string, unknown>;
    }>;
    queryByTenantStatus(tenantId: string, status: string, params: RunsQueryParams): Promise<{
        items: Run[];
        lastKey?: Record<string, unknown>;
    }>;
    getById(tenantId: string, runId: string): Promise<Run | null>;
    getSteps(runId: string): Promise<RunStep[]>;
}
export declare function createRunsHandler(repo: RunRepository): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
//# sourceMappingURL=handler.d.ts.map