/**
 * Registration handler – core business logic extracted for testability.
 *
 * Takes a DynamoDB-compatible client and request body, returns a result object.
 * The route.ts file is a thin wrapper that calls this handler.
 */

import { isValidEmail, isValidPassword } from '../../../lib/auth/validation.js';
import { hashPassword } from '../../../lib/auth/password.js';
import { signToken } from '../../../lib/auth/jwt.js';
import { bootstrapTenant } from '../../../lib/tenant-bootstrap.js';
import { tenantPK, userSK, emailPK, SK_VALUES } from '../../../../src/models/schema.js';
import type { UserRecord, EmailIndexRecord } from '../../../lib/auth/types.js';

export interface RegisterInput {
  email: string;
  password: string;
  tenantName: string;
}

export interface RegisterResult {
  status: number;
  body: Record<string, unknown>;
  token?: string;
}

export interface RegisterClient {
  put(params: { TableName: string; Item: Record<string, unknown> }): Promise<void>;
  get(params: {
    TableName: string;
    Key: Record<string, string>;
  }): Promise<{ Item?: Record<string, unknown> }>;
}

export async function handleRegister(
  client: RegisterClient,
  tableName: string,
  input: RegisterInput,
): Promise<RegisterResult> {
  const { email, password, tenantName } = input;

  // 1. Validate email format
  if (!email || !isValidEmail(email)) {
    return { status: 400, body: { error: 'Invalid email format', field: 'email' } };
  }

  // 2. Validate password length
  if (!password || !isValidPassword(password)) {
    return { status: 400, body: { error: 'Password must be at least 12 characters', field: 'password' } };
  }

  // 3. Validate tenantName
  if (!tenantName || tenantName.trim().length === 0) {
    return { status: 400, body: { error: 'Tenant name is required', field: 'tenantName' } };
  }

  // 4. Check for duplicate email
  const existing = await client.get({
    TableName: tableName,
    Key: { PK: emailPK(email), SK: SK_VALUES.META },
  });

  if (existing.Item) {
    return { status: 409, body: { error: 'Email already registered' } };
  }

  // 5. Generate IDs and hash password
  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();

  // 6. Write Tenant record
  await client.put({
    TableName: tableName,
    Item: {
      PK: tenantPK(tenantId),
      SK: SK_VALUES.META,
      tenantId,
      tenantName: tenantName.trim(),
      createdAt: now,
    },
  });

  // 7. Write UserRecord
  const userRecord: UserRecord = {
    PK: tenantPK(tenantId),
    SK: userSK(userId),
    userId,
    tenantId,
    email,
    passwordHash,
    role: 'admin',
    status: 'active',
    createdAt: now,
    notificationPrefs: {
      globalEnabled: true,
      workflowIds: 'all',
    },
  };
  await client.put({ TableName: tableName, Item: { ...userRecord } });

  // 8. Write EmailIndexRecord
  const emailRecord: EmailIndexRecord = {
    PK: emailPK(email),
    SK: SK_VALUES.META,
    userId,
    tenantId,
  };
  await client.put({ TableName: tableName, Item: { ...emailRecord } });

  // 9. Bootstrap tenant (environments + audit)
  await bootstrapTenant(client, tableName, {
    tenantId,
    adminUserId: userId,
    adminEmail: email,
  });

  // 10. Sign JWT
  const token = await signToken({ userId, tenantId, role: 'admin', email });

  return {
    status: 201,
    body: { userId, tenantId, email, role: 'admin' },
    token,
  };
}
