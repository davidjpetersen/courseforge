import { store } from '../../_shared/store.js';

export async function GET(request: { tenantId: string; query?: Record<string, string | undefined> }) {
  const runs = await store.listRuns(request.tenantId, {
    workflowId: request.query?.workflowId,
    status: request.query?.status,
    limit: request.query?.limit ? Number(request.query.limit) : 50,
  });

  return { statusCode: 200, body: JSON.stringify(runs) };
}
