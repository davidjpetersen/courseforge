/**
 * Auth types for CourseForge Connect
 *
 * Defines the core type system for authentication, RBAC, and tenant management.
 */

export type UserRole = 'admin' | 'builder' | 'viewer';
export type UserStatus = 'active' | 'invited' | 'suspended';

export interface UserRecord {
  PK: string;
  SK: string;
  userId: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  lastLoginAt?: string;
  notificationPrefs: {
    globalEnabled: boolean;
    workflowIds: string[] | 'all';
  };
}

export interface EmailIndexRecord {
  PK: string;
  SK: string;
  userId: string;
  tenantId: string;
}

export interface InviteRecord {
  PK: string;
  SK: string;
  inviteId: string;
  email: string;
  role: UserRole;
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
  accepted: boolean;
}

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: UserRole;
  email: string;
}

export interface JWTPayload {
  userId: string;
  tenantId: string;
  role: UserRole;
  email: string;
}
