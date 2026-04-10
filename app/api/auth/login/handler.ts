/**
 * Login handler – core business logic extracted for testability.
 *
 * Returns an identical 401 for all failure modes (email not found,
 * user suspended, wrong password) to prevent user enumeration.
 */

import { verifyPassword } from '../../../lib/auth/password';
import { signToken } from '../../../lib/auth/jwt';
import { emailPK, tenantPK, userSK, SK_VALUES } from '../../../../src/models/schema';
import type { UserRecord, EmailIndexRecord } from '../../../lib/auth/types';

const INVALID_CREDENTIALS = { error: 'Invalid credentials' } as const;

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResult {
  status: number;
  body: Record<string, unknown>;
  token?: string;
}

export interface LoginClient {
  get(params: {
    TableName: string;
    Key: Record<string, string>;
  }): Promise<{ Item?: Record<string, unknown> }>;
  put(params: { TableName: string; Item: Record<string, unknown> }): Promise<void>;
}

export async function handleLogin(
  client: LoginClient,
  tableName: string,
  input: LoginInput,
): Promise<LoginResult> {
  const { email, password } = input;

  if (!email || !password) {
    return { status: 401, body: { ...INVALID_CREDENTIALS } };
  }

  // 1. Look up EmailIndexRecord
  const emailResult = await client.get({
    TableName: tableName,
    Key: { PK: emailPK(email), SK: SK_VALUES.META },
  });

  if (!emailResult.Item) {
    return { status: 401, body: { ...INVALID_CREDENTIALS } };
  }

  const emailRecord = emailResult.Item as unknown as EmailIndexRecord;

  // 2. Fetch UserRecord
  const userResult = await client.get({
    TableName: tableName,
    Key: { PK: tenantPK(emailRecord.tenantId), SK: userSK(emailRecord.userId) },
  });

  if (!userResult.Item) {
    return { status: 401, body: { ...INVALID_CREDENTIALS } };
  }

  const user = userResult.Item as unknown as UserRecord;

  // 3. Verify status is active
  if (user.status !== 'active') {
    return { status: 401, body: { ...INVALID_CREDENTIALS } };
  }

  // 4. Verify password
  const passwordValid = await verifyPassword(password, user.passwordHash);
  if (!passwordValid) {
    return { status: 401, body: { ...INVALID_CREDENTIALS } };
  }

  // 5. Update lastLoginAt
  const now = new Date().toISOString();
  await client.put({
    TableName: tableName,
    Item: { ...user, lastLoginAt: now },
  });

  // 6. Sign JWT
  const token = await signToken({
    userId: user.userId,
    tenantId: user.tenantId,
    role: user.role,
    email: user.email,
  });

  return {
    status: 200,
    body: {
      userId: user.userId,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
      lastLoginAt: now,
    },
    token,
  };
}
