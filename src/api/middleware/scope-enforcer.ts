// ── Types ──

export interface APIGatewayProxyResult {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

// ── Constants ──

const JSON_HEADERS = { 'Content-Type': 'application/json' };

const MUTATING_METHODS = new Set(['POST', 'PUT', 'DELETE']);

// ── Scope Enforcer ──

/**
 * Returns `null` if the request is allowed under the given scope,
 * or a 403 response object if the scope is insufficient.
 *
 * Rules:
 * - `write` scope → always allowed
 * - `read` scope + GET → allowed
 * - `read` scope + POST/PUT/DELETE → 403
 */
export function enforceScopeForRequest(
  scope: 'read' | 'write',
  method: string,
  path: string,
): APIGatewayProxyResult | null {
  if (scope === 'write') return null;

  const upper = method.toUpperCase();

  if (!MUTATING_METHODS.has(upper)) return null;

  return {
    statusCode: 403,
    headers: JSON_HEADERS,
    body: JSON.stringify({ error: 'Insufficient scope' }),
  };
}
