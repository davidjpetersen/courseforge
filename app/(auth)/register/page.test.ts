import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const source = readFileSync(
  resolve(__dirname, 'page.tsx'),
  'utf-8',
);

describe('RegisterPage component structure', () => {
  it('has use client directive at the top', () => {
    expect(source.trimStart().startsWith("'use client'")).toBe(true);
  });

  it('renders email, password, and tenant name input fields (Req 14.1)', () => {
    expect(source).toContain('type="email"');
    expect(source).toContain('type="password"');
    expect(source).toContain('id="email"');
    expect(source).toContain('id="password"');
    expect(source).toContain('id="tenantName"');
  });

  it('enforces minimum password length of 12 characters (Req 14.2)', () => {
    expect(source).toContain('password.length < 12');
    expect(source).toContain('Password must be at least 12 characters');
  });

  it('displays a password strength indicator (Req 14.2)', () => {
    expect(source).toContain('getPasswordStrength');
    expect(source).toContain('aria-label="Password strength"');
    expect(source).toContain('Strength:');
  });

  it('performs inline validation on all fields before submission (Req 14.3)', () => {
    expect(source).toContain('validateEmail');
    expect(source).toContain('validatePassword');
    expect(source).toContain('validateTenantName');
    expect(source).toContain('onBlur');
  });

  it('redirects to /recipes on success (Req 14.4)', () => {
    expect(source).toContain("router.push('/recipes')");
  });

  it('calls POST /api/auth/register on submit', () => {
    expect(source).toContain("'/api/auth/register'");
    expect(source).toContain("method: 'POST'");
  });

  it('sends email, password, and tenantName in the request body', () => {
    expect(source).toContain('JSON.stringify({ email, password, tenantName })');
  });

  it('has labels associated with inputs for accessibility', () => {
    expect(source).toContain('htmlFor="email"');
    expect(source).toContain('htmlFor="password"');
    expect(source).toContain('htmlFor="tenantName"');
  });

  it('disables submit button while submitting', () => {
    expect(source).toContain('disabled={submitting}');
  });

  it('displays error toast on failure', () => {
    expect(source).toContain('role="alert"');
    expect(source).toContain('setToast');
  });

  it('has a link to the login page', () => {
    expect(source).toContain('href="/login"');
    expect(source).toContain('Sign in');
  });
});
