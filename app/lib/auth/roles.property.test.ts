import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { ROLE_LEVEL, hasRole } from './roles.js';
import type { UserRole } from './types.js';

// ── Arbitraries ──

const allRoles: UserRole[] = ['admin', 'builder', 'viewer'];
const arbRole = fc.constantFrom<UserRole>(...allRoles);

// ── Property 2: Role hierarchy is a total order ──

describe('Feature: auth-rbac-tenant, Property 2: Role hierarchy is a total order', () => {
  /**
   * Validates: Requirements 6.2, 6.3, 6.4, 5.4
   *
   * For any pair of roles, hasRole(userRole, requiredRole) returns true
   * iff ROLE_LEVEL[userRole] >= ROLE_LEVEL[requiredRole].
   */
  it('hasRole matches ROLE_LEVEL comparison for all role pairs', () => {
    fc.assert(
      fc.property(arbRole, arbRole, (userRole, requiredRole) => {
        const expected = ROLE_LEVEL[userRole] >= ROLE_LEVEL[requiredRole];
        expect(hasRole(userRole, requiredRole)).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  it('admin satisfies all roles', () => {
    fc.assert(
      fc.property(arbRole, (requiredRole) => {
        expect(hasRole('admin', requiredRole)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('builder satisfies builder and viewer but not admin', () => {
    fc.assert(
      fc.property(arbRole, (requiredRole) => {
        if (requiredRole === 'admin') {
          expect(hasRole('builder', requiredRole)).toBe(false);
        } else {
          expect(hasRole('builder', requiredRole)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('viewer satisfies only viewer', () => {
    fc.assert(
      fc.property(arbRole, (requiredRole) => {
        if (requiredRole === 'viewer') {
          expect(hasRole('viewer', requiredRole)).toBe(true);
        } else {
          expect(hasRole('viewer', requiredRole)).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });
});
