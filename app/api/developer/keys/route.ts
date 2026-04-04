import { createApiKey, redactApiKey } from '../../../lib/developer/service.js';
import { store } from '../../_shared/store.js';

interface RequestLike {
  tenantId: string;
  userId: string;
  body?: string;
}

export async function POST(request: RequestLike) {
  if (!request.body) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Request body is required' }) };
  }

  const parsed = JSON.parse(request.body) as { name?: string; scope?: 'read' | 'write' };

  if (!parsed.name || (parsed.scope !== 'read' && parsed.scope !== 'write')) {
    return { statusCode: 400, body: JSON.stringify({ error: 'name and valid scope are required' }) };
  }

  const created = await createApiKey({
    store,
    tenantId: request.tenantId,
    name: parsed.name,
    scope: parsed.scope,
    createdBy: request.userId,
  });

  return { statusCode: 200, body: JSON.stringify(created) };
}

export async function GET(request: RequestLike) {
  const keys = await store.listByTenant(request.tenantId);
  return { statusCode: 200, body: JSON.stringify(keys.map(redactApiKey)) };
}
