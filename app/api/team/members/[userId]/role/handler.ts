/**
 * Change role handler – core business logic extracted for testability.
 *
 * Updates a user's role and writes an audit log entry.
 */

import { tenantPK, userSK } from '../../../../../../src/models/schema.js';
import { writeAuditLog } from '../../../../../../packages/utils/src/audit.js';
import { ActionType } from '../../../../../../packages/types/src/audit.js';
import type { AuthContext, UserRole, UserRecord } from '../../../../../lib/auth/types.js';

const VALID_ROLES: UserRole[] = ['admin', 'builder', 'viewer'];

export interface ChangeRoleInput {
  role: UserRole;
}

export interface ChangeRoleResult {
  status: number;
  body: Record<string, unknown>;
}

export interface ChangeRoleClient {
  get(params: {
    TableName: string;
    Key: Record<string, string>;
  }): Promise<{ Item?: Record<string, unknown> }>;
  put(params: { TableName: string; Item: Record<string, unknown> }): Promise<void>;
}

export async function handleChangeRole(
  client: ChangeRoleClient,
  tableName: string,
  targetUserId: string,
  input: ChangeRoleInput,
  ctx: AuthContext,
  meta: { ipAddress: string; userAgent: string },
): Promise<ChangeRoleResult> {
  const { role: newRole } = input;

  // Block self-demotion
  if (ctx.userId === targetUserId) {
    return { status: 422, body: { error: 'Self-demotion is not allowed' } };
  }

  if (!newRole || !VALID_ROLES.includes(newRole)) {
    return { status: 400, body: { error: 'Invalid role', field: 'role' } };
  }

  // Fetch target user
  const userResult = await client.get({
    TableName: tableName,
    Key: { PK: tenantPK(ctx.tenantId), SK: userSK(targetUserId) },
  });

  if (!userResult.Item) {
    return { status: 404, body: { error: 'User not found' } };
  }

  const user = userResult.Item as unknown as UserRecord;
  const oldRole = user.role;

  // Update role
  await client.put({
    TableName: tableName,
    Item: { ...user, role: newRole },
  });

  // Write audit log
  await writeAuditLog(client, tableName, {
    tenantId: ctx.tenantId,
    actor: ctx.userId,
    actorEmail: ctx.email,
    actionType: ActionType.USER_ROLE_CHANGED,
    resourceType: 'user',
    resourceId: targetUserId,
    detail: { oldRole, newRole },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return { status: 200, body: { userId: targetUserId, role: newRole } };
}
