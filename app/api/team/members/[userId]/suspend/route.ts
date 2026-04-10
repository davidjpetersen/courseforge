/**
 * POST /api/team/members/[userId]/suspend
 *
 * Thin Next.js route wrapper around the suspend handler.
 * Requires admin role.
 */

import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

import { requireAdmin } from '../../../../../lib/auth/middleware';
import { handleSuspend } from './handler';
import type { SuspendClient } from './handler';

const rawClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(rawClient);
const tableName = process.env.MAIN_TABLE_NAME ?? 'CourseForgeRuns';

const client: SuspendClient = {
  async get(params) {
    const result = await ddb.send(new GetCommand(params));
    return { Item: result.Item as Record<string, unknown> | undefined };
  },
  async put(params) {
    await ddb.send(new PutCommand(params));
  },
};

export const POST = requireAdmin(
  async (request: NextRequest, ctx) => {
    try {
      const { userId: targetUserId } = (request as unknown as { params: { userId: string } }).params;
      const ipAddress = request.headers.get('x-forwarded-for') ?? 'unknown';
      const userAgent = request.headers.get('user-agent') ?? 'unknown';

      const result = await handleSuspend(client, tableName, targetUserId, ctx, {
        ipAddress,
        userAgent,
      });

      if (result.status === 204) {
        return new NextResponse(null, { status: 204 });
      }

      return NextResponse.json(result.body, { status: result.status });
    } catch {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  },
);
