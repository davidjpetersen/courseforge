/**
 * Role hierarchy for CourseForge Connect RBAC
 *
 * admin (3) > builder (2) > viewer (1)
 */

import type { UserRole } from './types.js';

export const ROLE_LEVEL: Record<UserRole, number> = {
  admin: 3,
  builder: 2,
  viewer: 1,
};

/**
 * Check whether `userRole` satisfies the `requiredRole` in the hierarchy.
 * Returns true when the user's level is >= the required level.
 */
export function hasRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_LEVEL[userRole] >= ROLE_LEVEL[requiredRole];
}
