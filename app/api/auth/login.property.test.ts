import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fc from 'fast-check';

// Mock bcrypt to avoid slow hashing in property tests
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2b$12$mockedhashvalue'),
    compare: vi.fn().mockImplementation(async (_plain: string, _hash: string) => false),
  },
}));

import { handleLogin, type LoginClient } from './login/handler.js';
import type { UserRecord, EmailIndexRecord } from '../../lib/auth/types.js';
import { emailPK, tenantPK, userSK, SK_VALUES } from '../../../src/models/schema.js';

// ── Setup ──

const TEST_SECRET = 'test-jwt-secret-for-property-tests-minimum-length';

beforeAll(() => {
  process.env.AUTH_JWT_SECRET = TEST_SECRET;
});

afterAll(() => {
  delete process.env.AUTH_JWT_SECRET;
});

// ── Helpers ──

const EXPECTED_FAILURE = { error: 'Invalid credentials' };

function buildEmailRecord(email: string): EmailIndexRecord {
  return {
    PK: emailPK(email),
    SK: SK_VALUES.META,
    userId: 'user-123',
    tenantId: 'tenant-456',
  };
}

function buildUserRecord(overrides?: Partial<UserRecord>): UserRecord {
  return {
    PK: tenantPK('tenant-456'),
    SK: userSK('user-123'),
    userId: 'user-123',
    tenantId: 'tenant-456',
    email: 'test@example.com',
    passwordHash: '$2b$12$mockedhashvalue',
    role: 'admin',
    status: 'active',
    createdAt: new Date().toISOString(),
    notificationPrefs: { globalEnabled: true, workflowIds: 'all' },
    ...overrides,
  };
}

// ── Arbitraries ──

const arbEmail = fc.emailAddress();
const arbPassword = fc.string({ minLength: 1, maxLength: 72 });
const arbSuspendedStatus = fc.constantFrom('invited' as const, 'suspended' as const);

// ── Property 5: Login failure responses are indistinguishable ──

describe('Feature: auth-rbac-tenant, Property 5: Login failure responses are indistinguishable', () => {
  /**
   * Validates: Requirements 2.4, 11.6
   *
   * For any login failure scenario — email not found, user not active,
   * or wrong password — the response is always identical: 401 with
   * { error: 'Invalid credentials' } and no additional info.
   */

  it('email not found returns identical 401', async () => {
    await fc.assert(
      fc.asyncProperty(arbEmail, arbPassword, async (email, password) => {
        const client: LoginClient = {
          get: vi.fn().mockResolvedValue({ Item: undefined }),
          put: vi.fn(),
        };

        const result = await handleLogin(client, 'TestTable', { email, password });

        expect(result.status).toBe(401);
        expect(result.body).toEqual(EXPECTED_FAILURE);
        expect(result.token).toBeUndefined();
        expect(Object.keys(result.body)).toEqual(['error']);
      }),
      { numRuns: 100 },
    );
  });

  it('user not active returns identical 401', async () => {
    await fc.assert(
      fc.asyncProperty(arbEmail, arbPassword, arbSuspendedStatus, async (email, password, status) => {
        const emailRecord = buildEmailRecord(email);
        const userRecord = buildUserRecord({ email, status });

        const client: LoginClient = {
          get: vi.fn().mockImplementation(async (params: { Key: Record<string, string> }) => {
            if (params.Key.PK.startsWith('EMAIL#')) {
              return { Item: emailRecord };
            }
            return { Item: userRecord };
          }),
          put: vi.fn(),
        };

        const result = await handleLogin(client, 'TestTable', { email, password });

        expect(result.status).toBe(401);
        expect(result.body).toEqual(EXPECTED_FAILURE);
        expect(result.token).toBeUndefined();
        expect(Object.keys(result.body)).toEqual(['error']);
      }),
      { numRuns: 100 },
    );
  });

  it('wrong password returns identical 401', async () => {
    await fc.assert(
      fc.asyncProperty(arbEmail, arbPassword, async (email, password) => {
        const emailRecord = buildEmailRecord(email);
        const userRecord = buildUserRecord({ email, status: 'active' });

        // bcrypt.compare is mocked to return false (wrong password)
        const client: LoginClient = {
          get: vi.fn().mockImplementation(async (params: { Key: Record<string, string> }) => {
            if (params.Key.PK.startsWith('EMAIL#')) {
              return { Item: emailRecord };
            }
            return { Item: userRecord };
          }),
          put: vi.fn(),
        };

        const result = await handleLogin(client, 'TestTable', { email, password });

        expect(result.status).toBe(401);
        expect(result.body).toEqual(EXPECTED_FAILURE);
        expect(result.token).toBeUndefined();
        expect(Object.keys(result.body)).toEqual(['error']);
      }),
      { numRuns: 100 },
    );
  });

  it('all three failure modes produce byte-identical response bodies', async () => {
    await fc.assert(
      fc.asyncProperty(arbEmail, arbPassword, async (email, password) => {
        const emailRecord = buildEmailRecord(email);
        const activeUser = buildUserRecord({ email, status: 'active' });
        const suspendedUser = buildUserRecord({ email, status: 'suspended' });

        // Scenario 1: email not found
        const notFoundClient: LoginClient = {
          get: vi.fn().mockResolvedValue({ Item: undefined }),
          put: vi.fn(),
        };
        const r1 = await handleLogin(notFoundClient, 'T', { email, password });

        // Scenario 2: user suspended
        const suspendedClient: LoginClient = {
          get: vi.fn().mockImplementation(async (params: { Key: Record<string, string> }) => {
            if (params.Key.PK.startsWith('EMAIL#')) return { Item: emailRecord };
            return { Item: suspendedUser };
          }),
          put: vi.fn(),
        };
        const r2 = await handleLogin(suspendedClient, 'T', { email, password });

        // Scenario 3: wrong password (bcrypt mock returns false)
        const wrongPwClient: LoginClient = {
          get: vi.fn().mockImplementation(async (params: { Key: Record<string, string> }) => {
            if (params.Key.PK.startsWith('EMAIL#')) return { Item: emailRecord };
            return { Item: activeUser };
          }),
          put: vi.fn(),
        };
        const r3 = await handleLogin(wrongPwClient, 'T', { email, password });

        // All three must be identical
        const body1 = JSON.stringify(r1.body);
        const body2 = JSON.stringify(r2.body);
        const body3 = JSON.stringify(r3.body);

        expect(body1).toBe(body2);
        expect(body2).toBe(body3);
        expect(r1.status).toBe(r2.status);
        expect(r2.status).toBe(r3.status);
      }),
      { numRuns: 100 },
    );
  });
});
