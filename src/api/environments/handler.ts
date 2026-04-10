import type { EnvironmentRecord } from '../../models/types';

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

export interface EnvironmentRepository {
  listByTenant(tenantId: string): Promise<EnvironmentRecord[]>;
  countByTenant(tenantId: string): Promise<number>;
}

export interface WorkflowSummary {
  workflowId: string;
  name: string;
  status: string;
  environmentId: string;
}

export interface WorkflowRepository {
  countByEnvironment(tenantId: string, environmentId: string): Promise<number>;
  listByEnvironment(tenantId: string, environmentId: string): Promise<WorkflowSummary[]>;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

function getHeader(headers: Record<string, string> | null | undefined, key: string): string | null {
  if (!headers) {
    return null;
  }
  const match = Object.entries(headers).find(
    ([header]) => header.toLowerCase() === key.toLowerCase(),
  );
  return match ? match[1] : null;
}

const VALID_ENVIRONMENT_IDS = new Set(['dev', 'prod']);

export function createListEnvironmentsHandler(
  envRepo: EnvironmentRepository,
  wfRepo: WorkflowRepository,
): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult> {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const tenantId = getHeader(event.headers, 'x-tenant-id');
    if (!tenantId) {
      return jsonResponse(400, { message: 'Missing x-tenant-id header' });
    }

    const environments = await envRepo.listByTenant(tenantId);

    const enriched = await Promise.all(
      environments.map(async (env) => {
        const workflowCount = await wfRepo.countByEnvironment(tenantId, env.environmentId);
        return { ...env, workflowCount };
      }),
    );

    return jsonResponse(200, { environments: enriched });
  };
}

export function createListWorkflowsByEnvHandler(
  wfRepo: WorkflowRepository,
): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult> {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const tenantId = getHeader(event.headers, 'x-tenant-id');
    if (!tenantId) {
      return jsonResponse(400, { message: 'Missing x-tenant-id header' });
    }

    const environmentId = event.pathParameters?.environmentId;
    if (!environmentId || !VALID_ENVIRONMENT_IDS.has(environmentId)) {
      return jsonResponse(400, { message: "environmentId must be 'dev' or 'prod'" });
    }

    const workflows = await wfRepo.listByEnvironment(tenantId, environmentId);

    return jsonResponse(200, { workflows, environmentId });
  };
}
