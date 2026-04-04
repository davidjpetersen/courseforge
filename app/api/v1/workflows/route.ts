import { store } from '../../_shared/store.js';

interface RequestLike {
  tenantId: string;
  query?: Record<string, string | undefined>;
  body?: string;
}

export async function GET(request: RequestLike) {
  const workflows = await store.listWorkflows(request.tenantId, {
    status: request.query?.status,
    environmentId: request.query?.environmentId,
  });

  return { statusCode: 200, body: JSON.stringify(workflows) };
}

export async function POST(request: RequestLike) {
  if (!request.body) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Request body is required' }) };
  }

  const parsed = JSON.parse(request.body) as {
    name?: string;
    recipeId?: string;
    params?: Record<string, unknown>;
    environmentId?: string;
    connectionIds?: string[];
  };

  if (!parsed.name || !parsed.recipeId || !parsed.params || !parsed.environmentId || !Array.isArray(parsed.connectionIds)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid create workflow payload' }) };
  }

  const workflow = await store.createWorkflow({
    tenantId: request.tenantId,
    name: parsed.name,
    recipeId: parsed.recipeId,
    params: parsed.params,
    environmentId: parsed.environmentId,
    connectionIds: parsed.connectionIds,
  });

  return {
    statusCode: 200,
    body: JSON.stringify({
      workflowId: workflow.workflowId,
      versionId: workflow.versionId,
      status: workflow.status,
    }),
  };
}
