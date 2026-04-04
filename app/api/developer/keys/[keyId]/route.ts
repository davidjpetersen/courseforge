import { store } from '../../../_shared/store.js';

export async function DELETE(request: { tenantId: string; params: { keyId: string } }) {
  const deleted = await store.softDelete(request.tenantId, request.params.keyId, new Date().toISOString());
  if (!deleted) {
    return { statusCode: 404, body: JSON.stringify({ error: 'API key not found' }) };
  }

  return { statusCode: 200, body: JSON.stringify({ keyId: request.params.keyId, enabled: false }) };
}
