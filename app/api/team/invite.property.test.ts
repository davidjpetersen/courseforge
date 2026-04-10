import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fc from 'fast-check';

import { handleInvite, type InviteClient } from './invite/handler';
import type { AuthContext, UserRole } from '../../lib/auth/types';

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
const INVITE_EXPIRY_MS = 48 * 60 * 60 * 1000;
// Allow 5 seconds tolerance for timing
const TIMING_TOLERANCE_MS = 5000;

function buildMockClient() {
  const putCalls: Array<{ TableName: string; Item: Record<string, unknown> }> = [];
  const client: InviteClient = {
    put: vi.fn().mockImplementation(async (params) => {
      putCalls.push(params);
    }),
  };
  return { client, putCalls };
}

function buildAdminCtx(overrides?: Partial<AuthContext>): AuthContext {
  return {
    userId: 'admin-user-id',
    tenantId: 'tenant-123',
    role: 'admin',
    email: 'admin@example.com',
    ...overrides,
  };
}

// ── Arbitraries ──

const arbEmail = fc.emailAddress();
const arbRole = fc.constantFrom<UserRole>('admin', 'builder', 'viewer');
const arbAdminUserId = fc.uuid();
const arbTenantId = fc.uuid();

// ── Property 7: Invite record creation ──

describe('Feature: auth-rbac-tenant, Property 7: Invite record creation', () => {
  /**
   * Validates: Requirements 7.1, 7.5, 17.3
   *
   * For any valid invite input, the handler creates an InviteRecord with
   * correct PK/SK, valid UUID inviteId, expiresAt ~48h after createdAt,
   * accepted=false, and invitedBy matching the admin's userId.
   */

  it('creates invite record with correct structure and 48h expiry', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbEmail,
        arbRole,
        arbAdminUserId,
        arbTenantId,
        async (email, role, adminUserId, tenantId) => {
          const { client, putCalls } = buildMockClient();
          const ctx = buildAdminCtx({ userId: adminUserId, tenantId });

          const beforeCall = Date.now();
          const result = await handleInvite(client, 'TestTable', { email, role }, ctx);
          const afterCall = Date.now();

          expect(result.status).toBe(201);
          expect(putCalls).toHaveLength(1);

          const record = putCalls[0].Item;

          // PK = TENANT#{tenantId}
          expect(record.PK).toBe(`TENANT#${tenantId}`);

          // SK = INVITE#{inviteId} where inviteId is a valid UUID
          const sk = record.SK as string;
          expect(sk.startsWith('INVITE#')).toBe(true);
          const inviteId = sk.replace('INVITE#', '');
          expect(UUID_V4.test(inviteId)).toBe(true);
          expect(record.inviteId).toBe(inviteId);

          // Role matches input
          expect(record.role).toBe(role);

          // Email matches input
          expect(record.email).toBe(email);

          // invitedBy matches admin's userId
          expect(record.invitedBy).toBe(adminUserId);

          // accepted is false
          expect(record.accepted).toBe(false);

          // expiresAt is approximately 48h after createdAt
          const createdAt = new Date(record.createdAt as string).getTime();
          const expiresAt = new Date(record.expiresAt as string).getTime();
          const diff = expiresAt - createdAt;

          expect(diff).toBeGreaterThanOrEqual(INVITE_EXPIRY_MS - TIMING_TOLERANCE_MS);
          expect(diff).toBeLessThanOrEqual(INVITE_EXPIRY_MS + TIMING_TOLERANCE_MS);

          // createdAt is within the test execution window
          expect(createdAt).toBeGreaterThanOrEqual(beforeCall - TIMING_TOLERANCE_MS);
          expect(createdAt).toBeLessThanOrEqual(afterCall + TIMING_TOLERANCE_MS);

          // Invite URL is returned
          expect(result.body.inviteUrl).toBe(`/accept-invite?token=${inviteId}`);
        },
      ),
      { numRuns: 100 },
    );
  }, 30_000);
});
