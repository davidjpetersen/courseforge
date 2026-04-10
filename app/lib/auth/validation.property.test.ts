import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { isValidEmail, isValidPassword, MIN_PASSWORD_LENGTH } from './validation';

// ── Property 3: Registration input validation ──

describe('Feature: auth-rbac-tenant, Property 3: Registration input validation', () => {
  /**
   * Validates: Requirements 1.1, 1.2
   *
   * For any string, the registration validation SHALL reject the string as an
   * email if it does not match a standard email format, and SHALL reject the
   * string as a password if its length is less than 12 characters.
   */

  describe('email validation', () => {
    it('accepts well-formed email addresses', () => {
      fc.assert(
        fc.property(fc.emailAddress(), (email) => {
          expect(isValidEmail(email)).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it('rejects strings without an @ sign', () => {
      const noAtSign = fc.string({ minLength: 1 }).filter((s) => !s.includes('@'));
      fc.assert(
        fc.property(noAtSign, (input) => {
          expect(isValidEmail(input)).toBe(false);
        }),
        { numRuns: 100 },
      );
    });

    it('rejects empty strings', () => {
      expect(isValidEmail('')).toBe(false);
    });

    it('rejects strings with whitespace', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }).filter((s) => /\s/.test(s)),
          (input) => {
            expect(isValidEmail(input)).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('password validation', () => {
    it('accepts passwords with length >= 12', () => {
      const longPassword = fc.string({ minLength: MIN_PASSWORD_LENGTH, maxLength: 200 });
      fc.assert(
        fc.property(longPassword, (password) => {
          expect(isValidPassword(password)).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it('rejects passwords with length < 12', () => {
      const shortPassword = fc.string({ minLength: 0, maxLength: MIN_PASSWORD_LENGTH - 1 });
      fc.assert(
        fc.property(shortPassword, (password) => {
          expect(isValidPassword(password)).toBe(false);
        }),
        { numRuns: 100 },
      );
    });

    it('boundary: password of exactly 12 characters is accepted', () => {
      const exactly12 = fc.string({ minLength: MIN_PASSWORD_LENGTH, maxLength: MIN_PASSWORD_LENGTH });
      fc.assert(
        fc.property(exactly12, (password) => {
          expect(isValidPassword(password)).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it('boundary: password of exactly 11 characters is rejected', () => {
      const exactly11 = fc.string({ minLength: MIN_PASSWORD_LENGTH - 1, maxLength: MIN_PASSWORD_LENGTH - 1 });
      fc.assert(
        fc.property(exactly11, (password) => {
          expect(isValidPassword(password)).toBe(false);
        }),
        { numRuns: 100 },
      );
    });
  });
});
