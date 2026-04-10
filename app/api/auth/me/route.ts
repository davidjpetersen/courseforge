/**
 * GET /api/auth/me
 *
 * Returns the current user from the JWT payload.
 * Uses withAuth to verify the session cookie.
 */

import { NextResponse } from 'next/server';
import { withAuth } from '../../../lib/auth/middleware';
import type { AuthContext } from '../../../lib/auth/types';

const handler = withAuth(async (_req, ctx: AuthContext) => {
  return NextResponse.json({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    email: ctx.email,
    role: ctx.role,
  });
});

export async function GET(request: Request) {
  return handler(request as never);
}
