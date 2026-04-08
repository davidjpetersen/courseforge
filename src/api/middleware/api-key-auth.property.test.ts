import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { createApiKeyAuthMiddleware } from './api-key-auth.js';
import type { AuthContext, APIGatewayProxyResult } from './api-key-auth.js';
import type { ApiKeyRecord, ApiKeyScope } from '../../../packages/types/src/api-keys.js';

// ── Helpers ──

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function isAuthContext(
  result: AuthContext | APIGatewayProxyResult,
): result is AuthContext {
  return 'tenantId' in result && !('statusCode' in result);
}

function is401(result: AuthContext | APIGatewayProxyResult): boolean {
  return !isAuthContext(result) && (result as APIGatewayProxyResult).statusCode === 401;
}

// ── Arbitraries ──

const arbToken = fc.stringOf(
  fc.constantFrom(
    'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
    'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '_', '-',
  ),
  { minLength: 1, maxLength: 64 },
);

const arbScope = fc.constantFrom<ApiKeyScope>('read', 'write');

const arbTenantId = fc.stringOf(
  fc.constantFrom('a', 'b', 'c', '1', '2', '3', '-'),
  { minLength: 1, maxLength: 20 },
);

const arbKeyId = fc.stringOf(
  fc.constantFrom('k', 'e', 'y', '1', '2', '3', '-'),
  { minLength: 1, maxLength: 20 },
);

function makeRecord(
  token: string,
  tenantId: string,
  keyId: string,
  scope: ApiKeyScope,
  enabled: boolean,
): ApiKeyRecord {
  return {
    keyId,
    tenantId,
    name: 'Test Key',
    hashedKey: hash(token),
    scope,
    createdBy: 'user-1',
    createdAt: '2024-01-01T00:00:00.000Z',
    lastUsedAt: null,
    enabled,
    deletedAt: enabled ? null : '2024-06-01T00:00:00.000Z',
  };
}


// ── Property 4: Auth middleware correctness ──

describe('Feature: developer-rest-api, Property 4: Auth middleware correctness', () => {
  /**
   * Validates: Requirements 4.1, 4.2, 4.3, 4.5
   *
   * For any Bearer token, the auth middleware SHALL return an AuthContext with the
   * correct tenantId and scope if and only if SHA-256(token) matches an ApiKeyRecord
   * with enabled=true; otherwise it SHALL return a 401 response.
   */

  it('returns AuthContext with correct fields when repo returns an enabled record', async () => {
    await fc.assert(
      fc.asyncProperty(arbToken, arbTenantId, arbKeyId, arbScope, async (token, tenantId, keyId, scope) => {
        const record = makeRecord(token, tenantId, keyId, scope, true);
        const repo = {
          findByHash: async (h: string) => (h === hash(token) ? record : null),
          updateLastUsed: async () => {},
        };

        const middleware = createApiKeyAuthMiddleware(repo);
        const result = await middleware({
          headers: { Authorization: `Bearer ${token}` },
        });

        expect(isAuthContext(result)).toBe(true);
        if (isAuthContext(result)) {
          expect(result.tenantId).toBe(tenantId);
          expect(result.scope).toBe(scope);
          expect(result.keyId).toBe(keyId);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('returns 401 when repo returns null (no matching record)', async () => {
    await fc.assert(
      fc.asyncProperty(arbToken, async (token) => {
        const repo = {
          findByHash: async () => null,
          updateLastUsed: async () => {},
        };

        const middleware = createApiKeyAuthMiddleware(repo);
        const result = await middleware({
          headers: { Authorization: `Bearer ${token}` },
        });

        expect(is401(result)).toBe(true);
        if (!isAuthContext(result)) {
          expect(JSON.parse(result.body)).toEqual({
            error: 'Invalid or revoked API key',
          });
        }
      }),
      { numRuns: 100 },
    );
  });

  it('returns 401 when repo returns a disabled record', async () => {
    await fc.assert(
      fc.asyncProperty(arbToken, arbTenantId, arbKeyId, arbScope, async (token, tenantId, keyId, scope) => {
        const record = makeRecord(token, tenantId, keyId, scope, false);
        const repo = {
          findByHash: async (h: string) => (h === hash(token) ? record : null),
          updateLastUsed: async () => {},
        };

        const middleware = createApiKeyAuthMiddleware(repo);
        const result = await middleware({
          headers: { Authorization: `Bearer ${token}` },
        });

        expect(is401(result)).toBe(true);
        if (!isAuthContext(result)) {
          expect(JSON.parse(result.body)).toEqual({
            error: 'Invalid or revoked API key',
          });
        }
      }),
      { numRuns: 100 },
    );
  });

  it('returns 401 when Authorization header is missing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom({}, { 'Content-Type': 'application/json' }, null, undefined),
        async (headers) => {
          const repo = {
            findByHash: async () => { throw new Error('should not be called'); },
            updateLastUsed: async () => {},
          };

          const middleware = createApiKeyAuthMiddleware(repo);
          const result = await middleware({
            headers: headers as Record<string, string> | null,
          });

          expect(is401(result)).toBe(true);
          if (!isAuthContext(result)) {
            expect(JSON.parse(result.body)).toEqual({
              error: 'Invalid or revoked API key',
            });
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
