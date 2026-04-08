/**
 * Unit tests for root-level Next.js middleware (dashboard route protection).
 *
 * Validates Requirements 12.1, 12.2, 12.3:
 * - Intercepts /(dashboard)/* routes
 * - Redirects to /login when cookie is missing or JWT is invalid
 * - Passes through when JWT is valid
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { SignJWT } from 'jose';

const TEST_SECRET = 'test-middleware-secret-for-unit-tests';

beforeAll(() => {
  process.env.AUTH_JWT_SECRET = TEST_SECRET;
});

afterAll(() => {
  delete process.env.AUTH_JWT_SECRET;
});

function getSecret(): Uint8Array {
  return new TextEncoder().encode(TEST_SECRET);
}

async function signTestToken(payload: Record<string, unknown>): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .setIssuedAt()
    .sign(getSecret());
}

async function signExpiredToken(payload: Record<string, unknown>): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(Math.floor(Date.now() / 1000) - 60) // expired 60s ago
    .setIssuedAt(Math.floor(Date.now() / 1000) - 3700)
    .sign(getSecret());
}

function createMockRequest(url: string, cookieValue?: string) {
  const cookies = new Map<string, { value: string }>();
  if (cookieValue !== undefined) {
    cookies.set('courseforge_session', { value: cookieValue });
  }

  return {
    url,
    cookies: {
      get(name: string) {
        return cookies.get(name);
      },
    },
  };
}

// We need to dynamically import the middleware after setting env vars
async function getMiddleware() {
  // Clear module cache to pick up env var
  const mod = await import('./middleware.js');
  return mod;
}

describe('Root middleware – dashboard route protection', () => {
  it('redirects to /login when courseforge_session cookie is missing', async () => {
    const { middleware } = await getMiddleware();
    const request = createMockRequest('http://localhost:3000/dashboard/recipes');

    const response = await middleware(request as any);

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/login');
  });

  it('redirects to /login when JWT is invalid (malformed)', async () => {
    const { middleware } = await getMiddleware();
    const request = createMockRequest(
      'http://localhost:3000/dashboard/workflows',
      'not-a-valid-jwt',
    );

    const response = await middleware(request as any);

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/login');
  });

  it('redirects to /login when JWT is expired', async () => {
    const { middleware } = await getMiddleware();
    const expiredToken = await signExpiredToken({
      userId: 'u1',
      tenantId: 't1',
      role: 'admin',
      email: 'test@example.com',
    });
    const request = createMockRequest(
      'http://localhost:3000/dashboard/runs',
      expiredToken,
    );

    const response = await middleware(request as any);

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/login');
  });

  it('redirects to /login when JWT is signed with a different secret', async () => {
    const { middleware } = await getMiddleware();
    const wrongSecret = new TextEncoder().encode('wrong-secret-key');
    const token = await new SignJWT({
      userId: 'u1',
      tenantId: 't1',
      role: 'admin',
      email: 'test@example.com',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .setIssuedAt()
      .sign(wrongSecret);

    const request = createMockRequest(
      'http://localhost:3000/dashboard/admin',
      token,
    );

    const response = await middleware(request as any);

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/login');
  });

  it('passes through with NextResponse.next() when JWT is valid', async () => {
    const { middleware } = await getMiddleware();
    const validToken = await signTestToken({
      userId: 'user-123',
      tenantId: 'tenant-456',
      role: 'builder',
      email: 'builder@example.com',
    });
    const request = createMockRequest(
      'http://localhost:3000/dashboard/recipes',
      validToken,
    );

    const response = await middleware(request as any);

    // NextResponse.next() returns a 200 with no location header
    expect(response.headers.get('location')).toBeNull();
    expect(response.status).toBe(200);
  });

  it('exports a config with the correct matcher', async () => {
    const { config } = await getMiddleware();

    expect(config).toBeDefined();
    expect(config.matcher).toEqual(['/(dashboard)/:path*']);
  });
});
