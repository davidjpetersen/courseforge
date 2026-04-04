import { store } from '../../../_shared/store.js';

export async function GET(request: { tenantId: string; params: { workflowId: string } }) {
  const workflow = await store.getWorkflow(request.tenantId, request.params.workflowId);
  if (!workflow) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Workflow not found' }) };
  }

  return { statusCode: 200, body: JSON.stringify(workflow) };
}
