import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fc from 'fast-check';

// Mock bcrypt before importing handler (bcrypt is slow for 100+ iterations)
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2b$12$mockedhashvalue'),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

import { handleRegister, type RegisterClient } from './register/handler';

// ── Setup ──

const TEST_SECRET = 'test-jwt-secret-for-property-tests-minimum-length';

beforeAll(() => {
  process.env.AUTH_JWT_SECRET = TEST_SECRET;
});

afterAll(() => {
  delete process.env.AUTH_JWT_SECRET;
});

// ── Helpers ──

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function buildMockClient() {
  const putCalls: Array<{ TableName: string; Item: Record<string, unknown> }> = [];
  const client: RegisterClient = {
    put: vi.fn().mockImplementation(async (params) => {
      putCalls.push(params);
    }),
    get: vi.fn().mockResolvedValue({ Item: undefined }),
  };
  return { client, putCalls };
}

// ── Arbitraries ──

const arbEmail = fc.emailAddress();
const arbPassword = fc.string({ minLength: 12, maxLength: 72 });
const arbTenantName = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0);

// ── Property 4: Registration creates correct DynamoDB records ──

describe('Feature: auth-rbac-tenant, Property 4: Registration creates correct DynamoDB records', () => {
  /**
   * Validates: Requirements 1.6, 17.1, 17.2
   *
   * For any valid registration input, the handler writes exactly 3 records
   * (Tenant, UserRecord, EmailIndexRecord) before bootstrapTenant runs,
   * with correct PK/SK patterns, role=admin, and status=active.
   */

  it('writes exactly 3 records with correct keys before bootstrap', async () => {
    await fc.assert(
      fc.asyncProperty(arbEmail, arbPassword, arbTenantName, async (email, password, tenantName) => {
        const { client, putCalls } = buildMockClient();

        const result = await handleRegister(client, 'TestTable', { email, password, tenantName });

        expect(result.status).toBe(201);

        // The handler writes 3 records directly, then bootstrapTenant writes 4 more = 7 total
        expect(putCalls.length).toBe(7);

        const [tenantRecord, userRecord, emailRecord] = putCalls;

        // 1. Tenant record: PK=TENANT#{tenantId}, SK=META
        expect(tenantRecord.Item.PK).toMatch(/^TENANT#/);
        expect(tenantRecord.Item.SK).toBe('META');
        expect(UUID_V4.test(tenantRecord.Item.tenantId as string)).toBe(true);

        // 2. UserRecord: PK=TENANT#{tenantId}, SK=USER#{userId}, role=admin, status=active
        expect(userRecord.Item.PK).toBe(tenantRecord.Item.PK);
        expect((userRecord.Item.SK as string).startsWith('USER#')).toBe(true);
        expect(userRecord.Item.role).toBe('admin');
        expect(userRecord.Item.status).toBe('active');
        expect(userRecord.Item.email).toBe(email);
        expect(UUID_V4.test(userRecord.Item.userId as string)).toBe(true);

        // 3. EmailIndexRecord: PK=EMAIL#{email}, SK=META
        expect(emailRecord.Item.PK).toBe(`EMAIL#${email}`);
        expect(emailRecord.Item.SK).toBe('META');
        expect(emailRecord.Item.userId).toBe(userRecord.Item.userId);
        expect(emailRecord.Item.tenantId).toBe(tenantRecord.Item.tenantId);
      }),
      { numRuns: 100 },
    );
  }, 30_000);

  it('all generated UUIDs are valid v4', async () => {
    await fc.assert(
      fc.asyncProperty(arbEmail, arbPassword, arbTenantName, async (email, password, tenantName) => {
        const { client, putCalls } = buildMockClient();

        await handleRegister(client, 'TestTable', { email, password, tenantName });

        const userRecord = putCalls[1];
        const tenantId = userRecord.Item.tenantId as string;
        const userId = userRecord.Item.userId as string;

        expect(UUID_V4.test(tenantId)).toBe(true);
        expect(UUID_V4.test(userId)).toBe(true);
      }),
      { numRuns: 100 },
    );
  }, 30_000);
});
