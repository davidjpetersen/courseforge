/**
 * Accept-invite handler – core business logic extracted for testability.
 *
 * Validates the invite, creates a UserRecord + EmailIndexRecord,
 * marks the invite accepted, signs a JWT, and returns user data.
 */

import { isValidPassword } from '../../../lib/auth/validation';
import { hashPassword } from '../../../lib/auth/password';
import { signToken } from '../../../lib/auth/jwt';
import { tenantPK, userSK, emailPK, inviteSK, SK_VALUES } from '../../../../src/models/schema';
import type { InviteRecord, UserRecord, EmailIndexRecord } from '../../../lib/auth/types';

export interface AcceptInviteInput {
  inviteId: string;
  email: string;
  password: string;
}

export interface AcceptInviteResult {
  status: number;
  body: Record<string, unknown>;
  token?: string;
}

export interface AcceptInviteClient {
  get(params: {
    TableName: string;
    Key: Record<string, string>;
  }): Promise<{ Item?: Record<string, unknown> }>;
  put(params: { TableName: string; Item: Record<string, unknown> }): Promise<void>;
}

export async function handleAcceptInvite(
  client: AcceptInviteClient,
  tableName: string,
  input: AcceptInviteInput,
  tenantId: string,
): Promise<AcceptInviteResult> {
  const { inviteId, email, password } = input;

  if (!inviteId) {
    return { status: 400, body: { error: 'inviteId is required' } };
  }

  // 1. Fetch invite record
  const inviteResult = await client.get({
    TableName: tableName,
    Key: { PK: tenantPK(tenantId), SK: inviteSK(inviteId) },
  });

  if (!inviteResult.Item) {
    return { status: 404, body: { error: 'Invite not found' } };
  }

  const invite = inviteResult.Item as unknown as InviteRecord;

  // 2. Check if already accepted
  if (invite.accepted) {
    return { status: 409, body: { error: 'Invite already used' } };
  }

  // 3. Check if expired
  if (new Date(invite.expiresAt) < new Date()) {
    return { status: 410, body: { error: 'Invite expired' } };
  }

  // 4. Validate password
  if (!password || !isValidPassword(password)) {
    return { status: 400, body: { error: 'Password must be at least 12 characters', field: 'password' } };
  }

  // 5. Create user
  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();

  const userRecord: UserRecord = {
    PK: tenantPK(tenantId),
    SK: userSK(userId),
    userId,
    tenantId,
    email,
    passwordHash,
    role: invite.role,
    status: 'active',
    createdAt: now,
    notificationPrefs: { globalEnabled: true, workflowIds: 'all' },
  };

  await client.put({ TableName: tableName, Item: { ...userRecord } });

  // 6. Create EmailIndexRecord
  const emailRecord: EmailIndexRecord = {
    PK: emailPK(email),
    SK: SK_VALUES.META,
    userId,
    tenantId,
  };

  await client.put({ TableName: tableName, Item: { ...emailRecord } });

  // 7. Mark invite accepted
  await client.put({
    TableName: tableName,
    Item: { ...invite, accepted: true },
  });

  // 8. Sign JWT
  const token = await signToken({ userId, tenantId, role: invite.role, email });

  return {
    status: 201,
    body: { userId, tenantId, role: invite.role },
    token,
  };
}
