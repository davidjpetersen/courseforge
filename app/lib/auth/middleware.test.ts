import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  withAuth,
  requireAdmin,
  requireBuilder,
  requireViewer,
} from './middleware';
import { signToken } from './jwt';
import type { AuthContext, JWTPayload } from './types';

// ── Setup ──

const TEST_SECRET = 'test-jwt-secret-for-unit-tests-minimum-length';

beforeAll(() => {
  process.env.AUTH_JWT_SECRET = TEST_SECRET;
});

afterAll(() => {
  delete process.env.AUTH_JWT_SECRET;
});

// ── Helpers ──

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

function captureHandler() {
  let captured: AuthContext | undefined;
  const handler = async (_req: unknown, ctx: AuthContext) => {
    captured = ctx;
    return { status: 200, json: async () => ({ ok: true }) } as any;
  };
  return { handler, getCaptured: () => captured };
}

const samplePayload: JWTPayload = {
  userId: 'user-123',
  tenantId: 'tenant-456',
  role: 'builder',
  email: 'builder@example.com',
};

// ── Unit tests: Requirement 18.1 — valid JWT → handler called with correct context ──

describe('withAuth middleware', () => {
  it('calls handler with correct AuthContext for a valid JWT (Req 18.1)', async () => {
    const token = await signToken(samplePayload);
    const req = mockRequest(token);
    const { handler, getCaptured } = captureHandler();

    const wrapped = withAuth(handler);
    const res = await wrapped(req as any);

    expect((res as any).status).toBe(200);
    const ctx = getCaptured();
    expect(ctx).toBeDefined();
    expect(ctx!.userId).toBe('user-123');
    expect(ctx!.tenantId).toBe('tenant-456');
    expect(ctx!.role).toBe('builder');
    expect(ctx!.email).toBe('builder@example.com');
  });

  // ── Requirement 18.2 — missing cookie → 401 ──

  it('returns 401 when cookie is missing (Req 18.2)', async () => {
    const req = mockRequest(/* no token */);
    const { handler, getCaptured } = captureHandler();

    const wrapped = withAuth(handler);
    const res = await wrapped(req as any);

    expect((res as any).status).toBe(401);
    const body = await (res as any).json();
    expect(body.error).toBe('Unauthorized');
    expect(getCaptured()).toBeUndefined();
  });

  // ── Requirement 18.3 — expired token → 401 ──

  it('returns 401 for an expired token (Req 18.3)', async () => {
    // Create a token that is already expired by using jose directly
    const { SignJWT } = await import('jose');
    const secret = new TextEncoder().encode(TEST_SECRET);
    const expiredToken = await new SignJWT({ ...samplePayload })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60) // 1 minute ago
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600) // 1 hour ago
      .sign(secret);

    const req = mockRequest(expiredToken);
    const { handler, getCaptured } = captureHandler();

    const wrapped = withAuth(handler);
    const res = await wrapped(req as any);

    expect((res as any).status).toBe(401);
    const body = await (res as any).json();
    expect(body.error).toBe('Unauthorized');
    expect(getCaptured()).toBeUndefined();
  });

  // ── Requirement 18.4 — insufficient role → 403 with requiredRole ──

  it('returns 403 with requiredRole when role is insufficient (Req 18.4)', async () => {
    // samplePayload has role 'builder', require 'admin'
    const token = await signToken(samplePayload);
    const req = mockRequest(token);
    const { handler, getCaptured } = captureHandler();

    const wrapped = withAuth(handler, { requiredRole: 'admin' });
    const res = await wrapped(req as any);

    expect((res as any).status).toBe(403);
    const body = await (res as any).json();
    expect(body.error).toBe('Insufficient permissions');
    expect(body.requiredRole).toBe('admin');
    expect(getCaptured()).toBeUndefined();
  });

  it('allows access when role satisfies the required role', async () => {
    const adminPayload: JWTPayload = { ...samplePayload, role: 'admin' };
    const token = await signToken(adminPayload);
    const req = mockRequest(token);
    const { handler, getCaptured } = captureHandler();

    const wrapped = withAuth(handler, { requiredRole: 'admin' });
    const res = await wrapped(req as any);

    expect((res as any).status).toBe(200);
    expect(getCaptured()!.role).toBe('admin');
  });
});

// ── Convenience wrappers ──

describe('convenience wrappers', () => {
  it('requireAdmin rejects non-admin roles', async () => {
    const token = await signToken({ ...samplePayload, role: 'viewer' });
    const req = mockRequest(token);
    const { handler } = captureHandler();

    const wrapped = requireAdmin(handler);
    const res = await wrapped(req as any);

    expect((res as any).status).toBe(403);
    const body = await (res as any).json();
    expect(body.requiredRole).toBe('admin');
  });

  it('requireAdmin allows admin', async () => {
    const token = await signToken({ ...samplePayload, role: 'admin' });
    const req = mockRequest(token);
    const { handler, getCaptured } = captureHandler();

    const wrapped = requireAdmin(handler);
    const res = await wrapped(req as any);

    expect((res as any).status).toBe(200);
    expect(getCaptured()!.role).toBe('admin');
  });

  it('requireBuilder allows builder and admin', async () => {
    for (const role of ['builder', 'admin'] as const) {
      const token = await signToken({ ...samplePayload, role });
      const req = mockRequest(token);
      const { handler, getCaptured } = captureHandler();

      const wrapped = requireBuilder(handler);
      const res = await wrapped(req as any);

      expect((res as any).status).toBe(200);
      expect(getCaptured()!.role).toBe(role);
    }
  });

  it('requireBuilder rejects viewer', async () => {
    const token = await signToken({ ...samplePayload, role: 'viewer' });
    const req = mockRequest(token);
    const { handler } = captureHandler();

    const wrapped = requireBuilder(handler);
    const res = await wrapped(req as any);

    expect((res as any).status).toBe(403);
    const body = await (res as any).json();
    expect(body.requiredRole).toBe('builder');
  });

  it('requireViewer allows all roles', async () => {
    for (const role of ['viewer', 'builder', 'admin'] as const) {
      const token = await signToken({ ...samplePayload, role });
      const req = mockRequest(token);
      const { handler, getCaptured } = captureHandler();

      const wrapped = requireViewer(handler);
      const res = await wrapped(req as any);

      expect((res as any).status).toBe(200);
      expect(getCaptured()!.role).toBe(role);
    }
  });
});
