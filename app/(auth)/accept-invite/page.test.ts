import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const source = readFileSync(
  resolve(__dirname, 'page.tsx'),
  'utf-8',
);

describe('AcceptInvitePage component structure', () => {
  it('has use client directive at the top', () => {
    expect(source.trimStart().startsWith("'use client'")).toBe(true);
  });

  it('reads token from query params', () => {
    expect(source).toContain('useSearchParams');
    expect(source).toContain("searchParams.get('token')");
  });

  it('renders email and password input fields (Req 8.5)', () => {
    expect(source).toContain('type="email"');
    expect(source).toContain('type="password"');
    expect(source).toContain('id="email"');
    expect(source).toContain('id="password"');
  });

  it('performs inline validation on email format', () => {
    expect(source).toContain('validateEmail');
    expect(source).toMatch(/[^\s@]+@[^\s@]+/);
  });

  it('enforces minimum password length of 12 characters (Req 8.5)', () => {
    expect(source).toContain('password.length < 12');
    expect(source).toContain('Password must be at least 12 characters');
  });

  it('handles missing token error state', () => {
    expect(source).toContain('missingToken');
    expect(source).toContain('Invalid invitation link');
  });

  it('displays error toast for API error responses (Req 8.2, 8.3, 8.4)', () => {
    expect(source).toContain('role="alert"');
    expect(source).toContain('setToast');
  });

  it('calls POST /api/team/accept-invite on submit (Req 8.1)', () => {
    expect(source).toContain("'/api/team/accept-invite'");
    expect(source).toContain("method: 'POST'");
  });

  it('sends inviteId, email, and password in the request body', () => {
    expect(source).toContain('inviteId: token');
    expect(source).toContain('email');
    expect(source).toContain('password');
  });

  it('redirects to /recipes on success (Req 8.8)', () => {
    expect(source).toContain("router.push('/recipes')");
  });

  it('has labels associated with inputs for accessibility', () => {
    expect(source).toContain('htmlFor="email"');
    expect(source).toContain('htmlFor="password"');
  });

  it('disables submit button while submitting', () => {
    expect(source).toContain('disabled={submitting');
  });

  it('disables form fields when token is missing', () => {
    expect(source).toContain('disabled={missingToken}');
  });

  it('has a link to the login page', () => {
    expect(source).toContain('href="/login"');
    expect(source).toContain('Sign in');
  });
});
