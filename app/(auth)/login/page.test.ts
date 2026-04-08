import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const source = readFileSync(
  resolve(__dirname, 'page.tsx'),
  'utf-8',
);

describe('LoginPage component structure', () => {
  it('has use client directive at the top', () => {
    expect(source.trimStart().startsWith("'use client'")).toBe(true);
  });

  it('renders email and password input fields (Req 13.1)', () => {
    expect(source).toContain('type="email"');
    expect(source).toContain('type="password"');
    expect(source).toContain('id="email"');
    expect(source).toContain('id="password"');
  });

  it('performs inline validation on email format (Req 13.2)', () => {
    expect(source).toContain('validateEmail');
    expect(source).toMatch(/[^\s@]+@[^\s@]+/);
  });

  it('performs inline validation on password required (Req 13.2)', () => {
    expect(source).toContain('validatePassword');
    expect(source).toContain('Password is required');
  });

  it('displays error toast on login failure (Req 13.3)', () => {
    expect(source).toContain('role="alert"');
    expect(source).toContain('setToast');
  });

  it('has a link to the registration page (Req 13.4)', () => {
    expect(source).toContain('href="/register"');
    expect(source).toContain('Register');
  });

  it('redirects to /recipes on success (Req 13.5)', () => {
    expect(source).toContain("router.push('/recipes')");
  });

  it('calls POST /api/auth/login on submit', () => {
    expect(source).toContain("'/api/auth/login'");
    expect(source).toContain("method: 'POST'");
  });

  it('has labels associated with inputs for accessibility', () => {
    expect(source).toContain('htmlFor="email"');
    expect(source).toContain('htmlFor="password"');
  });

  it('disables submit button while submitting', () => {
    expect(source).toContain('disabled={submitting}');
  });
});
