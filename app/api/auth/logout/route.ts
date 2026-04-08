/**
 * POST /api/auth/logout
 *
 * Clears the session cookie and returns 204.
 */

import { NextResponse } from 'next/server';
import { clearSessionCookie } from '../../../lib/auth/jwt.js';

export async function POST() {
  const response = new NextResponse(null, { status: 204 });
  clearSessionCookie(response);
  return response;
}
