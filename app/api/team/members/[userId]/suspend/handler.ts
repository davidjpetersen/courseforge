/**
 * Suspend handler – core business logic extracted for testability.
 *
 * Sets a user's status to 'suspended' and writes an audit log entry.
 */

import { tenantPK, userSK } from '../../../../../../src/models/schema.js';
import { writeAuditLog } from '../../../../../../packages/utils/src/audit.js';
import { ActionType } from '../../../../../../packages/types/src/audit.js';
import type { AuthContext, UserRecord } from '../../../../../lib/auth/types.js';

export interface SuspendResult {
  status: number;
  body: Record<string, unknown> | null;
}

export interface SuspendClient {
  get(params: {
    TableName: string;
    Key: Record<string, string>;
  }): Promise<{ Item?: Record<string, unknown> }>;
  put(params: { TableName: string; Item: Record<string, unknown> }): Promise<void>;
}

export async function handleSuspend(
  client: SuspendClient,
  tableName: string,
  targetUserId: string,
  ctx: AuthContext,
  meta: { ipAddress: string; userAgent: string },
): Promise<SuspendResult> {
  // Block self-suspension
  if (ctx.userId === targetUserId) {
    return { status: 422, body: { error: 'Self-suspension is not allowed' } };
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

  // Set status to suspended
  await client.put({
    TableName: tableName,
    Item: { ...user, status: 'suspended' },
  });

  // Write audit log
  await writeAuditLog(client, tableName, {
    tenantId: ctx.tenantId,
    actor: ctx.userId,
    actorEmail: ctx.email,
    actionType: ActionType.USER_SUSPENDED,
    resourceType: 'user',
    resourceId: targetUserId,
    detail: { previousStatus: user.status },
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  return { status: 204, body: null };
}
