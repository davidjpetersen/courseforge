/**
 * Invite handler – core business logic extracted for testability.
 *
 * Creates an InviteRecord with 48h expiry and returns an invite URL.
 */

import { tenantPK, inviteSK } from '../../../../src/models/schema.js';
import { isValidEmail } from '../../../lib/auth/validation.js';
import type { AuthContext, UserRole, InviteRecord } from '../../../lib/auth/types.js';

const VALID_ROLES: UserRole[] = ['admin', 'builder', 'viewer'];
const INVITE_EXPIRY_MS = 48 * 60 * 60 * 1000; // 48 hours

export interface InviteInput {
  email: string;
  role: UserRole;
}

export interface InviteResult {
  status: number;
  body: Record<string, unknown>;
}

export interface InviteClient {
  put(params: { TableName: string; Item: Record<string, unknown> }): Promise<void>;
}

export async function handleInvite(
  client: InviteClient,
  tableName: string,
  input: InviteInput,
  ctx: AuthContext,
): Promise<InviteResult> {
  const { email, role } = input;

  if (!email || !isValidEmail(email)) {
    return { status: 400, body: { error: 'Invalid email format', field: 'email' } };
  }

  if (!role || !VALID_ROLES.includes(role)) {
    return { status: 400, body: { error: 'Invalid role', field: 'role' } };
  }

  const inviteId = crypto.randomUUID();
  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + INVITE_EXPIRY_MS).toISOString();

  const record: InviteRecord = {
    PK: tenantPK(ctx.tenantId),
    SK: inviteSK(inviteId),
    inviteId,
    email,
    role,
    invitedBy: ctx.userId,
    createdAt,
    expiresAt,
    accepted: false,
  };

  await client.put({ TableName: tableName, Item: { ...record } });

  return {
    status: 201,
    body: { inviteUrl: `/accept-invite?token=${inviteId}` },
  };
}
