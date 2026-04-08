/**
 * JWT utilities for CourseForge Connect
 *
 * Uses jose (HS256) for token signing and verification.
 * Tokens carry userId, tenantId, role, and email claims with a 1-hour expiry.
 */

import { SignJWT, jwtVerify } from 'jose';
import type { JWTPayload } from './types.js';

const COOKIE_NAME = 'courseforge_session';
const TOKEN_EXPIRY = '1h';

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret) {
    throw new Error('AUTH_JWT_SECRET environment variable is not set');
  }
  return new TextEncoder().encode(secret);
}

/**
 * Sign a JWT containing the given payload claims.
 * Returns the compact JWS string.
 */
export async function signToken(payload: JWTPayload): Promise<string> {
  const secret = getSecret();
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(TOKEN_EXPIRY)
    .setIssuedAt()
    .sign(secret);
}

/**
 * Verify a JWT and return the decoded payload.
 * Throws if the token is invalid, expired, or signed with a different secret.
 */
export async function verifyToken(token: string): Promise<JWTPayload> {
  const secret = getSecret();
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ['HS256'],
  });

  return {
    userId: payload.userId as string,
    tenantId: payload.tenantId as string,
    role: payload.role as JWTPayload['role'],
    email: payload.email as string,
  };
}

/** Minimal cookie-capable response interface. */
export interface CookieResponse {
  cookies: {
    set(name: string, value: string, options?: Record<string, unknown>): void;
  };
}

/**
 * Set the session cookie on a response object.
 * Cookie: courseforge_session, HttpOnly, SameSite=Strict, Secure, Path=/
 */
export function setSessionCookie(response: CookieResponse, token: string): void {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: true,
    path: '/',
    maxAge: 60 * 60, // 1 hour, matches JWT expiry
  });
}

/**
 * Clear the session cookie by setting it to empty with an expired date.
 */
export function clearSessionCookie(response: CookieResponse): void {
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'strict',
    secure: true,
    path: '/',
    maxAge: 0,
  });
}

export { COOKIE_NAME };
