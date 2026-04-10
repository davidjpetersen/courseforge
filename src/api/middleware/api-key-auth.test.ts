import { createHash } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';

import { createApiKeyAuthMiddleware } from './api-key-auth';
import type { AuthContext, APIGatewayProxyResult } from './api-key-auth';
import type { ApiKeyRecord } from '../../../packages/types/src/api-keys';

// ── Helpers ──

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function makeRecord(overrides: Partial<ApiKeyRecord> = {}): ApiKeyRecord {
  return {
    keyId: 'key-1',
    tenantId: 'tenant-1',
    name: 'Test Key',
    hashedKey: hash('cfk_live_testtoken'),
    scope: 'write',
    createdBy: 'user-1',
    createdAt: '2024-01-01T00:00:00.000Z',
    lastUsedAt: null,
    enabled: true,
    deletedAt: null,
    ...overrides,
  };
}

function isAuthContext(
  result: AuthContext | APIGatewayProxyResult,
): result is AuthContext {
  return 'tenantId' in result && !('statusCode' in result);
}

// ── Tests ──

describe('createApiKeyAuthMiddleware', () => {
  it('returns AuthContext for a valid enabled key', async () => {
    const record = makeRecord();
    const repo = {
      findByHash: vi.fn().mockResolvedValue(record),
      updateLastUsed: vi.fn().mockResolvedValue(undefined),
    };

    const middleware = createApiKeyAuthMiddleware(repo);
    const result = await middleware({
      headers: { Authorization: 'Bearer cfk_live_testtoken' },
    });

    expect(isAuthContext(result)).toBe(true);
    if (isAuthContext(result)) {
      expect(result.tenantId).toBe('tenant-1');
      expect(result.scope).toBe('write');
      expect(result.keyId).toBe('key-1');
    }

    expect(repo.findByHash).toHaveBeenCalledWith(hash('cfk_live_testtoken'));
  });

  it('returns 401 when Authorization header is missing', async () => {
    const repo = {
      findByHash: vi.fn(),
      updateLastUsed: vi.fn(),
    };

    const middleware = createApiKeyAuthMiddleware(repo);
    const result = await middleware({ headers: {} });

    expect(isAuthContext(result)).toBe(false);
    if (!isAuthContext(result)) {
      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body)).toEqual({
        error: 'Invalid or revoked API key',
      });
    }

    expect(repo.findByHash).not.toHaveBeenCalled();
  });

  it('returns 401 when headers object is null', async () => {
    const repo = {
      findByHash: vi.fn(),
      updateLastUsed: vi.fn(),
    };

    const middleware = createApiKeyAuthMiddleware(repo);
    const result = await middleware({ headers: null });

    expect(isAuthContext(result)).toBe(false);
    if (!isAuthContext(result)) {
      expect(result.statusCode).toBe(401);
    }
  });

  it('returns 401 for a malformed Authorization header (no Bearer prefix)', async () => {
    const repo = {
      findByHash: vi.fn(),
      updateLastUsed: vi.fn(),
    };

    const middleware = createApiKeyAuthMiddleware(repo);
    const result = await middleware({
      headers: { Authorization: 'Basic abc123' },
    });

    expect(isAuthContext(result)).toBe(false);
    if (!isAuthContext(result)) {
      expect(result.statusCode).toBe(401);
    }

    expect(repo.findByHash).not.toHaveBeenCalled();
  });

  it('returns 401 when key is not found', async () => {
    const repo = {
      findByHash: vi.fn().mockResolvedValue(null),
      updateLastUsed: vi.fn(),
    };

    const middleware = createApiKeyAuthMiddleware(repo);
    const result = await middleware({
      headers: { Authorization: 'Bearer cfk_live_unknown' },
    });

    expect(isAuthContext(result)).toBe(false);
    if (!isAuthContext(result)) {
      expect(result.statusCode).toBe(401);
      expect(JSON.parse(result.body)).toEqual({
        error: 'Invalid or revoked API key',
      });
    }
  });

  it('returns 401 when key is disabled', async () => {
    const record = makeRecord({ enabled: false });
    const repo = {
      findByHash: vi.fn().mockResolvedValue(record),
      updateLastUsed: vi.fn(),
    };

    const middleware = createApiKeyAuthMiddleware(repo);
    const result = await middleware({
      headers: { Authorization: 'Bearer cfk_live_testtoken' },
    });

    expect(isAuthContext(result)).toBe(false);
    if (!isAuthContext(result)) {
      expect(result.statusCode).toBe(401);
    }
  });

  it('fires updateLastUsed asynchronously on success', async () => {
    const record = makeRecord();
    const repo = {
      findByHash: vi.fn().mockResolvedValue(record),
      updateLastUsed: vi.fn().mockResolvedValue(undefined),
    };

    const middleware = createApiKeyAuthMiddleware(repo);
    await middleware({
      headers: { Authorization: 'Bearer cfk_live_testtoken' },
    });

    // Allow microtask to flush
    await new Promise((r) => setTimeout(r, 0));

    expect(repo.updateLastUsed).toHaveBeenCalledWith(
      'tenant-1',
      'key-1',
      expect.any(String),
    );
  });

  it('does not fail when updateLastUsed rejects', async () => {
    const record = makeRecord();
    const repo = {
      findByHash: vi.fn().mockResolvedValue(record),
      updateLastUsed: vi.fn().mockRejectedValue(new Error('DynamoDB timeout')),
    };

    const middleware = createApiKeyAuthMiddleware(repo);
    const result = await middleware({
      headers: { Authorization: 'Bearer cfk_live_testtoken' },
    });

    // Should still return AuthContext despite updateLastUsed failure
    expect(isAuthContext(result)).toBe(true);

    // Allow microtask to flush — no unhandled rejection
    await new Promise((r) => setTimeout(r, 0));
  });

  it('handles lowercase authorization header', async () => {
    const record = makeRecord();
    const repo = {
      findByHash: vi.fn().mockResolvedValue(record),
      updateLastUsed: vi.fn().mockResolvedValue(undefined),
    };

    const middleware = createApiKeyAuthMiddleware(repo);
    const result = await middleware({
      headers: { authorization: 'Bearer cfk_live_testtoken' },
    });

    expect(isAuthContext(result)).toBe(true);
  });
});
