import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fc from 'fast-check';

// Mock bcrypt to avoid slow hashing in property tests
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2b$12$mockedhashvalue'),
    compare: vi.fn().mockResolvedValue(true),
  },
}));

import { handleAcceptInvite, type AcceptInviteClient } from './accept-invite/handler';
import type { UserRole, InviteRecord } from '../../lib/auth/types';
import { tenantPK, inviteSK } from '../../../src/models/schema';

// ── Setup ──

const TEST_SECRET = 'test-jwt-secret-for-property-tests-minimum-length';

beforeAll(() => {
  process.env.AUTH_JWT_SECRET = TEST_SECRET;
});

afterAll(() => {
  delete process.env.AUTH_JWT_SECRET;
});

// ── Helpers ──

function buildInviteRecord(
  tenantId: string,
  inviteId: string,
  role: UserRole,
  email: string,
): InviteRecord {
  const now = new Date();
  return {
    PK: tenantPK(tenantId),
    SK: inviteSK(inviteId),
    inviteId,
    email,
    role,
    invitedBy: 'admin-user-id',
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(),
    accepted: false,
  };
}

function buildMockClient(invite: InviteRecord) {
  const putCalls: Array<{ TableName: string; Item: Record<string, unknown> }> = [];
  const client: AcceptInviteClient = {
    get: vi.fn().mockImplementation(async (params: { Key: Record<string, string> }) => {
      if (params.Key.SK.startsWith('INVITE#')) {
        return { Item: invite };
      }
      return { Item: undefined };
    }),
    put: vi.fn().mockImplementation(async (params) => {
      putCalls.push(params);
    }),
  };
  return { client, putCalls };
}

// ── Arbitraries ──

const arbRole = fc.constantFrom<UserRole>('admin', 'builder', 'viewer');
const arbEmail = fc.emailAddress();
const arbPassword = fc.string({ minLength: 12, maxLength: 72 });
const arbTenantId = fc.uuid();
const arbInviteId = fc.uuid();

// ── Property 8: Accept-invite assigns the invite's role ──

describe('Feature: auth-rbac-tenant, Property 8: Accept-invite assigns the invite\'s role', () => {
  /**
   * Validates: Requirements 8.5
   *
   * For any valid, non-expired, non-accepted invite with role R,
   * accepting the invite creates a UserRecord with role=R and status='active'.
   */

  it('user record gets the role from the invite', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbRole,
        arbEmail,
        arbPassword,
        arbTenantId,
        arbInviteId,
        async (role, email, password, tenantId, inviteId) => {
          const invite = buildInviteRecord(tenantId, inviteId, role, email);
          const { client, putCalls } = buildMockClient(invite);

          const result = await handleAcceptInvite(
            client,
            'TestTable',
            { inviteId, email, password },
            tenantId,
          );

          expect(result.status).toBe(201);

          // First put is the UserRecord
          const userRecord = putCalls[0].Item;
          expect(userRecord.role).toBe(role);
          expect(userRecord.status).toBe('active');

          // The returned body also has the correct role
          expect(result.body.role).toBe(role);
          expect(result.body.tenantId).toBe(tenantId);
        },
      ),
      { numRuns: 100 },
    );
  }, 30_000);
});
