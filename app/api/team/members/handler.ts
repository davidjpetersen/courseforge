/**
 * List members handler – core business logic extracted for testability.
 *
 * Queries DynamoDB for all USER# records in the tenant.
 */

import { tenantPK, KEY_PREFIX } from '../../../../src/models/schema.js';
import type { AuthContext, UserRecord } from '../../../lib/auth/types.js';

export interface MembersResult {
  status: number;
  body: Record<string, unknown>;
}

export interface MembersClient {
  query(params: {
    TableName: string;
    KeyConditionExpression: string;
    ExpressionAttributeValues: Record<string, string>;
  }): Promise<{ Items?: Record<string, unknown>[] }>;
}

export async function handleListMembers(
  client: MembersClient,
  tableName: string,
  ctx: AuthContext,
): Promise<MembersResult> {
  const result = await client.query({
    TableName: tableName,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': tenantPK(ctx.tenantId),
      ':skPrefix': KEY_PREFIX.USER,
    },
  });

  const members = (result.Items ?? []).map((item) => {
    const user = item as unknown as UserRecord;
    return {
      userId: user.userId,
      email: user.email,
      role: user.role,
      status: user.status,
      lastLoginAt: user.lastLoginAt ?? null,
    };
  });

  return { status: 200, body: { members } };
}
