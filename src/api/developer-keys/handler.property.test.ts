import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import fc from 'fast-check';

import { createApiKeyHandler, hashKey } from './handler';
import type { ApiKeyRepository } from './repository';
import type { ApiKeyRecord, ApiKeyScope } from '../../../packages/types/src/api-keys';

// ── Arbitraries ──

// Name must contain at least one non-space character (handler trims and rejects empty)
const arbName = fc
  .tuple(
    fc.stringOf(fc.constantFrom('a', 'b', 'c', 'K', 'e', 'y', '1'), { minLength: 1, maxLength: 15 }),
    fc.stringOf(fc.constantFrom(' ', 'x'), { minLength: 0, maxLength: 4 }),
  )
  .map(([core, pad]) => pad + core);

const arbScope = fc.constantFrom<ApiKeyScope>('read', 'write');

// ── In-memory mock repository ──

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


// ── Property 1: API key creation round-trip ──

describe('Feature: developer-rest-api, Property 1: API key creation round-trip', () => {
  /**
   * Validates: Requirements 1.1, 1.3, 1.4
   *
   * For any valid (name, scope) pair, creating an API key SHALL produce a response where:
   * (a) the key field matches cfk_live_[A-Za-z0-9_-]+
   * (b) SHA-256(key) equals the hashedKey stored in the repository
   * (c) the stored record contains all required fields
   * (d) the response contains keyId, key, scope, and name
   */
  it('produces correct key format, hash, stored fields, and response shape', async () => {
    await fc.assert(
      fc.asyncProperty(arbName, arbScope, async (name, scope) => {
        const repo = createInMemoryApiKeyRepo();
        const handler = createApiKeyHandler(repo);

        const response = await handler.create('tenant-1', 'user-1', { name, scope });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        // (d) Response contains required fields
        expect(body).toHaveProperty('keyId');
        expect(body).toHaveProperty('key');
        expect(body).toHaveProperty('scope');
        expect(body).toHaveProperty('name');

        // (a) Key matches expected format
        expect(body.key).toMatch(/^cfk_live_[A-Za-z0-9_-]+$/);

        // (b) SHA-256(key) equals stored hashedKey
        const expectedHash = createHash('sha256').update(body.key).digest('hex');
        const storedRecord = [...repo.records.values()][0];
        expect(storedRecord).toBeDefined();
        expect(storedRecord.hashedKey).toBe(expectedHash);

        // Also verify via the exported hashKey helper
        expect(hashKey(body.key)).toBe(storedRecord.hashedKey);

        // (c) Stored record contains all required fields
        expect(storedRecord.keyId).toBe(body.keyId);
        expect(storedRecord.tenantId).toBe('tenant-1');
        expect(storedRecord.name).toBe(name.trim());
        expect(storedRecord.scope).toBe(scope);
        expect(storedRecord.createdBy).toBe('user-1');
        expect(storedRecord.createdAt).toBeTruthy();
        expect(storedRecord.lastUsedAt).toBeNull();
        expect(storedRecord.enabled).toBe(true);
        expect(storedRecord.deletedAt).toBeNull();

        // Response scope and name match input
        expect(body.scope).toBe(scope);
        expect(body.name).toBe(name.trim());
      }),
      { numRuns: 100 },
    );
  });
});


// ── Property 2: API key listing returns all keys with required fields and no secrets ──

describe('Feature: developer-rest-api, Property 2: API key listing returns all keys with required fields and no secrets', () => {
  /**
   * Validates: Requirements 2.1, 2.2
   *
   * For any tenant with N created API keys, listing keys SHALL return exactly N items,
   * each containing required fields, and no item SHALL contain hashedKey or the raw key.
   */
  it('lists N created keys with required fields and no hashedKey', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({ name: arbName, scope: arbScope }), { minLength: 0, maxLength: 10 }),
        async (keyInputs) => {
          const repo = createInMemoryApiKeyRepo();
          const handler = createApiKeyHandler(repo);

          // Create N keys
          for (const input of keyInputs) {
            await handler.create('tenant-1', 'user-1', input);
          }

          // List keys
          const response = await handler.list('tenant-1');
          expect(response.statusCode).toBe(200);
          const body = JSON.parse(response.body);

          // Should return exactly N items
          expect(body).toHaveLength(keyInputs.length);

          // Each item has required fields and no secrets
          for (const item of body) {
            expect(item).toHaveProperty('keyId');
            expect(item).toHaveProperty('name');
            expect(item).toHaveProperty('scope');
            expect(item).toHaveProperty('createdBy');
            expect(item).toHaveProperty('createdAt');
            expect(item).toHaveProperty('enabled');
            expect(item).toHaveProperty('lastUsedAt');

            // No secrets exposed
            expect(item).not.toHaveProperty('hashedKey');
            expect(item.key).toBeUndefined();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ── Property 3: API key revocation sets enabled to false ──

describe('Feature: developer-rest-api, Property 3: API key revocation sets enabled to false', () => {
  /**
   * Validates: Requirements 3.1
   *
   * For any enabled API key belonging to the authenticated tenant, revoking it
   * SHALL set enabled to false and record a valid ISO 8601 deletedAt timestamp.
   */
  it('revocation sets enabled=false and records deletedAt', async () => {
    await fc.assert(
      fc.asyncProperty(arbName, arbScope, async (name, scope) => {
        const repo = createInMemoryApiKeyRepo();
        const handler = createApiKeyHandler(repo);

        // Create a key
        const createResponse = await handler.create('tenant-1', 'user-1', { name, scope });
        expect(createResponse.statusCode).toBe(200);
        const { keyId } = JSON.parse(createResponse.body);

        // Verify key is enabled before revocation
        const recordBefore = await repo.getByKeyId('tenant-1', keyId);
        expect(recordBefore).not.toBeNull();
        expect(recordBefore!.enabled).toBe(true);
        expect(recordBefore!.deletedAt).toBeNull();

        // Revoke the key
        const revokeResponse = await handler.revoke('tenant-1', keyId);
        expect(revokeResponse.statusCode).toBe(200);

        // Verify key is disabled after revocation
        const recordAfter = await repo.getByKeyId('tenant-1', keyId);
        expect(recordAfter).not.toBeNull();
        expect(recordAfter!.enabled).toBe(false);
        expect(recordAfter!.deletedAt).not.toBeNull();

        // deletedAt should be a valid ISO 8601 timestamp
        const deletedDate = new Date(recordAfter!.deletedAt!);
        expect(deletedDate.toISOString()).toBe(recordAfter!.deletedAt);
      }),
      { numRuns: 100 },
    );
  });
});
