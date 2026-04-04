import { store } from '../../../_shared/store.js';

export async function GET(request: { tenantId: string; params: { runId: string } }) {
  const run = await store.getRun(request.tenantId, request.params.runId);
  if (!run) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Run not found' }) };
  }

  return { statusCode: 200, body: JSON.stringify(run) };
}
