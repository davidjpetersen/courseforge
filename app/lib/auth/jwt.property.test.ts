import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fc from 'fast-check';

import { signToken, verifyToken } from './jwt';
import type { JWTPayload } from './types';
import type { UserRole } from './types';

// ── Setup: set a deterministic JWT secret for tests ──

const TEST_SECRET = 'test-jwt-secret-for-property-tests-minimum-length';

beforeAll(() => {
  process.env.AUTH_JWT_SECRET = TEST_SECRET;
});

afterAll(() => {
  delete process.env.AUTH_JWT_SECRET;
});

// ── Arbitraries ──

const allRoles: UserRole[] = ['admin', 'builder', 'viewer'];
const arbRole = fc.constantFrom<UserRole>(...allRoles);

/** Non-empty string that avoids control characters for clean payloads. */
const arbNonEmptyString = fc.string({ minLength: 1, maxLength: 64 }).filter((s) => s.trim().length > 0);

const arbEmail = fc.emailAddress();

const arbJWTPayload: fc.Arbitrary<JWTPayload> = fc.record({
  userId: arbNonEmptyString,
  tenantId: arbNonEmptyString,
  role: arbRole,
  email: arbEmail,
});

// ── Property 1: JWT sign/verify round-trip ──

describe('Feature: auth-rbac-tenant, Property 1: JWT sign/verify round-trip', () => {
  /**
   * Validates: Requirements 16.3
   *
   * For any valid JWT payload containing userId, tenantId, role, and email,
   * signing and then verifying SHALL produce a payload equivalent to the original.
   */
  it('sign then verify preserves all payload fields', async () => {
    await fc.assert(
      fc.asyncProperty(arbJWTPayload, async (payload) => {
        const token = await signToken(payload);
        const decoded = await verifyToken(token);

        expect(decoded.userId).toBe(payload.userId);
        expect(decoded.tenantId).toBe(payload.tenantId);
        expect(decoded.role).toBe(payload.role);
        expect(decoded.email).toBe(payload.email);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects tokens signed with a different secret', async () => {
    await fc.assert(
      fc.asyncProperty(arbJWTPayload, async (payload) => {
        // Sign with the test secret
        const token = await signToken(payload);

        // Switch to a different secret for verification
        process.env.AUTH_JWT_SECRET = 'completely-different-secret-value-here';
        try {
          await expect(verifyToken(token)).rejects.toThrow();
        } finally {
          // Restore the original test secret
          process.env.AUTH_JWT_SECRET = TEST_SECRET;
        }
      }),
      { numRuns: 100 },
    );
  });
});
