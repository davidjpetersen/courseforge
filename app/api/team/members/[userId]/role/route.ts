/**
 * PATCH /api/team/members/[userId]/role
 *
 * Thin Next.js route wrapper around the change role handler.
 * Requires admin role.
 */

import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

import { requireAdmin } from '../../../../../lib/auth/middleware';
import { handleChangeRole } from './handler';
import type { ChangeRoleClient } from './handler';

const rawClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(rawClient);
const tableName = process.env.MAIN_TABLE_NAME ?? 'CourseForgeRuns';

const client: ChangeRoleClient = {
  async get(params) {
    const result = await ddb.send(new GetCommand(params));
    return { Item: result.Item as Record<string, unknown> | undefined };
  },
  async put(params) {
    await ddb.send(new PutCommand(params));
  },
};

export const PATCH = requireAdmin(
  async (request: NextRequest, ctx) => {
    try {
      const { userId: targetUserId } = (request as unknown as { params: { userId: string } }).params;
      const body = await request.json();
      const ipAddress = request.headers.get('x-forwarded-for') ?? 'unknown';
      const userAgent = request.headers.get('user-agent') ?? 'unknown';

      const result = await handleChangeRole(client, tableName, targetUserId, body, ctx, {
        ipAddress,
        userAgent,
      });

      return NextResponse.json(result.body, { status: result.status });
    } catch {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
);
