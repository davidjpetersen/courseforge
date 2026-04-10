import { describe, expect, it, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';

import { createApiKeyHandler } from './handler';
import type { ApiKeyRepository } from './repository';
import type { ApiKeyRecord, ApiKeyScope } from '../../../packages/types/src/api-keys';

// ── In-memory mock repository (same pattern as property tests) ──

function createInMemoryApiKeyRepo(): ApiKeyRepository & { records: Map<string, ApiKeyRecord> } {
  const records = new Map<string, ApiKeyRecord>();

  return {
    records,

    async create(record: ApiKeyRecord): Promise<void> {
      records.set(`${record.tenantId}#${record.keyId}`, record);
    },

    async listByTenant(tenantId: string): Promise<ApiKeyRecord[]> {
      return [...records.values()].filter((r) => r.tenantId === tenantId);
    },

    async getByKeyId(tenantId: string, keyId: string): Promise<ApiKeyRecord | null> {
      return records.get(`${tenantId}#${keyId}`) ?? null;
    },

    async revoke(tenantId: string, keyId: string, deletedAt: string): Promise<void> {
      const key = `${tenantId}#${keyId}`;
      const record = records.get(key);
      if (record) {
        records.set(key, { ...record, enabled: false, deletedAt });
      }
    },

    async findByHash(hashedKey: string): Promise<ApiKeyRecord | null> {
      for (const record of records.values()) {
        if (record.hashedKey === hashedKey) return record;
      }
      return null;
    },

    async updateLastUsed(tenantId: string, keyId: string, timestamp: string): Promise<void> {
      const key = `${tenantId}#${keyId}`;
      const record = records.get(key);
      if (record) {
        records.set(key, { ...record, lastUsedAt: timestamp });
      }
    },
  };
}

// ── Tests ──

describe('createApiKeyHandler', () => {
  let repo: ReturnType<typeof createInMemoryApiKeyRepo>;
  let handler: ReturnType<typeof createApiKeyHandler>;

  beforeEach(() => {
    repo = createInMemoryApiKeyRepo();
    handler = createApiKeyHandler(repo);
  });

  // ── Create happy path (Requirements 1.1, 1.3, 1.4) ──

  describe('create', () => {
    it('returns 200 with keyId, key, scope, and name for valid input', async () => {
      const response = await handler.create('tenant-1', 'user-1', {
        name: 'My API Key',
        scope: 'read',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body).toHaveProperty('keyId');
      expect(body).toHaveProperty('key');
      expect(body.scope).toBe('read');
      expect(body.name).toBe('My API Key');

      // Key format matches cfk_live_*
      expect(body.key).toMatch(/^cfk_live_[A-Za-z0-9_-]+$/);

      // Stored record hash matches SHA-256 of raw key
      const stored = [...repo.records.values()][0];
      const expectedHash = createHash('sha256').update(body.key).digest('hex');
      expect(stored.hashedKey).toBe(expectedHash);
    });

    // ── Create with empty name → 400 (Requirement 1.2) ──

    it('returns 400 when name is empty', async () => {
      const response = await handler.create('tenant-1', 'user-1', {
        name: '',
        scope: 'write',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
    });

    it('returns 400 when name is only whitespace', async () => {
      const response = await handler.create('tenant-1', 'user-1', {
        name: '   ',
        scope: 'read',
      });

      expect(response.statusCode).toBe(400);
    });

    // ── Create with invalid scope → 400 (Requirement 1.2) ──

    it('returns 400 when scope is invalid', async () => {
      const response = await handler.create('tenant-1', 'user-1', {
        name: 'Test Key',
        scope: 'admin',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
    });

    it('returns 400 when scope is missing', async () => {
      const response = await handler.create('tenant-1', 'user-1', {
        name: 'Test Key',
        scope: undefined,
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ── List returns keys without hashedKey (Requirements 2.1, 2.2) ──

  describe('list', () => {
    it('returns keys without hashedKey field', async () => {
      await handler.create('tenant-1', 'user-1', { name: 'Key A', scope: 'read' });
      await handler.create('tenant-1', 'user-1', { name: 'Key B', scope: 'write' });

      const response = await handler.list('tenant-1');
      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toHaveLength(2);

      for (const item of body) {
        expect(item).toHaveProperty('keyId');
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('scope');
        expect(item).toHaveProperty('createdBy');
        expect(item).toHaveProperty('createdAt');
        expect(item).toHaveProperty('enabled');
        expect(item).not.toHaveProperty('hashedKey');
      }
    });

    it('returns empty array when tenant has no keys', async () => {
      const response = await handler.list('tenant-1');
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual([]);
    });
  });

  // ── Revoke happy path (Requirement 3.1) ──

  describe('revoke', () => {
    it('returns 200 and disables the key', async () => {
      const createRes = await handler.create('tenant-1', 'user-1', {
        name: 'Revocable Key',
        scope: 'write',
      });
      const { keyId } = JSON.parse(createRes.body);

      const revokeRes = await handler.revoke('tenant-1', keyId);
      expect(revokeRes.statusCode).toBe(200);

      const record = await repo.getByKeyId('tenant-1', keyId);
      expect(record!.enabled).toBe(false);
      expect(record!.deletedAt).not.toBeNull();
    });

    // ── Revoke with keyId not belonging to tenant → 404 (Requirement 3.2) ──

    it('returns 404 when keyId does not belong to the tenant', async () => {
      const createRes = await handler.create('tenant-1', 'user-1', {
        name: 'Tenant 1 Key',
        scope: 'read',
      });
      const { keyId } = JSON.parse(createRes.body);

      // Try to revoke from a different tenant
      const revokeRes = await handler.revoke('tenant-2', keyId);
      expect(revokeRes.statusCode).toBe(404);

      const body = JSON.parse(revokeRes.body);
      expect(body.error).toBeDefined();
    });
  });
});
