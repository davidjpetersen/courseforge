/**
 * Next.js root-level middleware for dashboard route protection.
 *
 * Intercepts all /(dashboard)/* routes, verifies the courseforge_session
 * JWT cookie, and redirects to /login when missing or invalid.
 *
 * Runs in the Edge runtime — uses jose directly instead of app/lib/auth/jwt.ts
 * to avoid Node.js module resolution issues.
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const COOKIE_NAME = 'courseforge_session';

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret) {
    throw new Error('AUTH_JWT_SECRET environment variable is not set');
  }
  return new TextEncoder().encode(secret);
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    await jwtVerify(token, getSecret(), { algorithms: ['HS256'] });
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: ['/(dashboard)/:path*'],
};
