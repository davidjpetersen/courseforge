import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fc from 'fast-check';

import { withAuth } from './middleware.js';
import { signToken } from './jwt.js';
import type { AuthContext, UserRole, JWTPayload } from './types.js';

// ── Setup: deterministic JWT secret ──

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

const arbNonEmptyString = fc
  .string({ minLength: 1, maxLength: 64 })
  .filter((s) => s.trim().length > 0);

const arbEmail = fc.emailAddress();

const arbJWTPayload: fc.Arbitrary<JWTPayload> = fc.record({
  userId: arbNonEmptyString,
  tenantId: arbNonEmptyString,
  role: arbRole,
  email: arbEmail,
});

// ── Helpers ──

/** Build a minimal mock request with the given cookie value. */
function mockRequest(token?: string) {
  return {
    cookies: {
      get(name: string) {
        if (name === 'courseforge_session' && token !== undefined) {
          return { value: token };
        }
        return undefined;
      },
    },
  };
}

/** A handler that captures the AuthContext it receives. */
function captureHandler() {
  let captured: AuthContext | undefined;
  const handler = async (_req: unknown, ctx: AuthContext) => {
    captured = ctx;
    return { status: 200, json: async () => ({ ok: true }) } as any;
  };
  return { handler, getCaptured: () => captured };
}

// ── Property 6: Auth middleware correctness ──

describe('Feature: auth-rbac-tenant, Property 6: Auth middleware correctness', () => {
  /**
   * Validates: Requirements 5.1, 5.2, 5.3, 5.6
   */

  it('calls handler with correct AuthContext for any valid JWT', async () => {
    /**
     * Validates: Requirements 5.1, 5.2, 5.6
     *
     * For any valid JWT payload, signing it and placing it in the cookie
     * SHALL cause withAuth to call the handler with a matching AuthContext.
     */
    await fc.assert(
      fc.asyncProperty(arbJWTPayload, async (payload) => {
        const token = await signToken(payload);
        const req = mockRequest(token);
        const { handler, getCaptured } = captureHandler();

        const wrapped = withAuth(handler);
        await wrapped(req as any);

        const ctx = getCaptured();
        expect(ctx).toBeDefined();
        expect(ctx!.userId).toBe(payload.userId);
        expect(ctx!.tenantId).toBe(payload.tenantId);
        expect(ctx!.role).toBe(payload.role);
        expect(ctx!.email).toBe(payload.email);
      }),
      { numRuns: 100 },
    );
  });

  it('returns 401 when cookie is missing', async () => {
    /**
     * Validates: Requirements 5.1, 5.3
     *
     * If the courseforge_session cookie is absent, the middleware SHALL
     * return 401 without calling the handler.
     */
    await fc.assert(
      fc.asyncProperty(arbJWTPayload, async (_payload) => {
        const req = mockRequest(/* no token */);
        const { handler, getCaptured } = captureHandler();

        const wrapped = withAuth(handler);
        const res = await wrapped(req as any);

        expect((res as any).status).toBe(401);
        expect(getCaptured()).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });

  it('returns 401 for malformed / tampered tokens', async () => {
    /**
     * Validates: Requirements 5.2, 5.3
     *
     * For any arbitrary string that is not a valid JWT signed with the
     * correct secret, the middleware SHALL return 401.
     */
    const arbGarbage = fc.string({ minLength: 1, maxLength: 256 });

    await fc.assert(
      fc.asyncProperty(arbGarbage, async (garbage) => {
        const req = mockRequest(garbage);
        const { handler, getCaptured } = captureHandler();

        const wrapped = withAuth(handler);
        const res = await wrapped(req as any);

        expect((res as any).status).toBe(401);
        expect(getCaptured()).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });

  it('returns 401 for tokens signed with a different secret', async () => {
    /**
     * Validates: Requirements 5.2, 5.3
     *
     * A token signed with secret A and verified with secret B SHALL be
     * rejected with 401.
     */
    await fc.assert(
      fc.asyncProperty(arbJWTPayload, async (payload) => {
        // Sign with the test secret
        const token = await signToken(payload);

        // Switch to a different secret for verification
        process.env.AUTH_JWT_SECRET = 'completely-different-secret-value-here';
        try {
          const req = mockRequest(token);
          const { handler, getCaptured } = captureHandler();

          const wrapped = withAuth(handler);
          const res = await wrapped(req as any);

          expect((res as any).status).toBe(401);
          expect(getCaptured()).toBeUndefined();
        } finally {
          process.env.AUTH_JWT_SECRET = TEST_SECRET;
        }
      }),
      { numRuns: 100 },
    );
  });
});
