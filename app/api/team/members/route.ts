/**
 * GET /api/team/members
 *
 * Thin Next.js route wrapper around the list members handler.
 * Requires admin role.
 */

import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

import { requireAdmin } from '../../../lib/auth/middleware.js';
import { handleListMembers } from './handler.js';
import type { MembersClient } from './handler.js';

const rawClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(rawClient);
const tableName = process.env.MAIN_TABLE_NAME ?? 'CourseForgeRuns';

const client: MembersClient = {
  async query(params) {
    const result = await ddb.send(new QueryCommand(params));
    return { Items: result.Items as Record<string, unknown>[] | undefined };
  },
};

export const GET = requireAdmin(async (_request: NextRequest, ctx) => {
  try {
    const result = await handleListMembers(client, tableName, ctx);
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
