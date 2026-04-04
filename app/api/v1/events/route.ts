import { store } from '../../_shared/store.js';

export async function POST(request: { tenantId: string; body?: string }) {
  if (!request.body) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Request body is required' }) };
  }

  const parsed = JSON.parse(request.body) as { workflowId?: string; payload?: Record<string, unknown> };
  if (!parsed.workflowId || !parsed.payload) {
    return { statusCode: 400, body: JSON.stringify({ error: 'workflowId and payload are required' }) };
  }

  const workflow = await store.getWorkflow(request.tenantId, parsed.workflowId);
  if (!workflow || workflow.status !== 'PUBLISHED') {
    return { statusCode: 403, body: JSON.stringify({ error: 'Workflow must be published and tenant-owned' }) };
  }

  const run = await store.createRun({
    tenantId: request.tenantId,
    workflowId: parsed.workflowId,
  });

  return { statusCode: 200, body: JSON.stringify({ runId: run.runId, traceId: run.traceId }) };
}
