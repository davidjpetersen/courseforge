/**
 * Auth middleware for CourseForge Connect
 *
 * Wraps Next.js API route handlers with JWT verification and optional role checks.
 * Extracts the JWT from the `courseforge_session` cookie, verifies it, and attaches
 * an AuthContext to the handler on success.
 */

import { verifyToken, COOKIE_NAME } from './jwt.js';
import { hasRole } from './roles.js';
import type { AuthContext, UserRole } from './types.js';

/** Minimal subset of NextRequest that the middleware relies on. */
export interface MiddlewareRequest {
  cookies: {
    get(name: string): { value: string } | undefined;
  };
}

/** Minimal NextResponse-compatible JSON response factory. */
export interface MiddlewareResponse {
  json(body: unknown, init?: { status?: number }): MiddlewareResponse;
}

/** Handler that receives the verified auth context. */
export type AuthenticatedHandler<
  Req extends MiddlewareRequest = MiddlewareRequest,
  Res extends MiddlewareResponse = MiddlewareResponse,
> = (req: Req, ctx: AuthContext) => Promise<Res>;

export interface WithAuthOptions {
  requiredRole?: UserRole;
}

/**
 * Higher-order function that wraps an API handler with authentication (and
 * optional authorization) checks.
 *
 * - Returns 401 `{ error: 'Unauthorized' }` when the cookie is missing, or the
 *   JWT is invalid / expired.
 * - Returns 403 `{ error: 'Insufficient permissions', requiredRole }` when the
 *   caller's role does not satisfy the required level.
 * - Calls `handler(req, authContext)` on success.
 */
export function withAuth<
  Req extends MiddlewareRequest = MiddlewareRequest,
  Res extends MiddlewareResponse = MiddlewareResponse,
>(
  handler: AuthenticatedHandler<Req, Res>,
  options?: WithAuthOptions,
): (req: Req) => Promise<Res> {
  return async (req: Req): Promise<Res> => {
    // 1. Extract token from cookie
    const cookie = req.cookies.get(COOKIE_NAME);
    if (!cookie || !cookie.value) {
      return NextJsonResponse.json(
        { error: 'Unauthorized' },
        { status: 401 },
      ) as unknown as Res;
    }

    // 2. Verify JWT
    let payload;
    try {
      payload = await verifyToken(cookie.value);
    } catch {
      return NextJsonResponse.json(
        { error: 'Unauthorized' },
        { status: 401 },
      ) as unknown as Res;
    }

    // 3. Check role hierarchy if required
    if (options?.requiredRole && !hasRole(payload.role, options.requiredRole)) {
      return NextJsonResponse.json(
        { error: 'Insufficient permissions', requiredRole: options.requiredRole },
        { status: 403 },
      ) as unknown as Res;
    }

    // 4. Build auth context and call handler
    const ctx: AuthContext = {
      userId: payload.userId,
      tenantId: payload.tenantId,
      role: payload.role,
      email: payload.email,
    };

    return handler(req, ctx);
  };
}

/**
 * Tiny helper that mirrors the NextResponse.json() static method so the
 * middleware can produce JSON responses without importing next/server at
 * runtime (keeps the module testable without Next.js installed).
 */
const NextJsonResponse = {
  json(body: unknown, init?: { status?: number }) {
    const status = init?.status ?? 200;
    const bodyStr = JSON.stringify(body);
    return {
      status,
      headers: new Headers({ 'content-type': 'application/json' }),
      async json() {
        return JSON.parse(bodyStr);
      },
      async text() {
        return bodyStr;
      },
    };
  },
};

// ── Convenience wrappers ──

/** Wrap a handler requiring the `admin` role. */
export const requireAdmin = <
  Req extends MiddlewareRequest = MiddlewareRequest,
  Res extends MiddlewareResponse = MiddlewareResponse,
>(
  handler: AuthenticatedHandler<Req, Res>,
) => withAuth(handler, { requiredRole: 'admin' });

/** Wrap a handler requiring the `builder` role. */
export const requireBuilder = <
  Req extends MiddlewareRequest = MiddlewareRequest,
  Res extends MiddlewareResponse = MiddlewareResponse,
>(
  handler: AuthenticatedHandler<Req, Res>,
) => withAuth(handler, { requiredRole: 'builder' });

/** Wrap a handler requiring the `viewer` role. */
export const requireViewer = <
  Req extends MiddlewareRequest = MiddlewareRequest,
  Res extends MiddlewareResponse = MiddlewareResponse,
>(
  handler: AuthenticatedHandler<Req, Res>,
) => withAuth(handler, { requiredRole: 'viewer' });
