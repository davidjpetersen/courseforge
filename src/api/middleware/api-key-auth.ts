import { createHash } from 'node:crypto';

import type { ApiKeyRepository } from '../developer-keys/repository.js';

// ── Types ──

export interface AuthContext {
  tenantId: string;
  scope: 'read' | 'write';
  keyId: string;
}

export interface APIGatewayProxyResult {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

// ── Helpers ──

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function unauthorized(): APIGatewayProxyResult {
  return {
    statusCode: 401,
    headers: JSON_HEADERS,
    body: JSON.stringify({ error: 'Invalid or revoked API key' }),
  };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function extractBearerToken(
  headers?: Record<string, string> | null,
): string | null {
  if (!headers) return null;

  // Header names may be lower-cased by API Gateway / Next.js
  const authHeader =
    headers['Authorization'] ?? headers['authorization'] ?? null;

  if (!authHeader) return null;

  const match = authHeader.match(/^Bearer\s+(\S+)$/);
  return match ? match[1] : null;
}

// ── Middleware factory ──

export function createApiKeyAuthMiddleware(
  repo: Pick<ApiKeyRepository, 'findByHash' | 'updateLastUsed'>,
): (req: {
  headers?: Record<string, string> | null;
}) => Promise<AuthContext | APIGatewayProxyResult> {
  return async (req) => {
    const token = extractBearerToken(req.headers);
    if (!token) return unauthorized();

    const hashed = hashToken(token);
    const record = await repo.findByHash(hashed);

    if (!record || !record.enabled) return unauthorized();

    // Fire-and-forget lastUsedAt update
    repo
      .updateLastUsed(record.tenantId, record.keyId, new Date().toISOString())
      .catch(() => {
        /* silently ignore */
      });

    return {
      tenantId: record.tenantId,
      scope: record.scope,
      keyId: record.keyId,
    };
  };
}
