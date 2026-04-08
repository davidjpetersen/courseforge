/**
 * POST /api/team/invite
 *
 * Thin Next.js route wrapper around the invite handler.
 * Requires admin role.
 */

import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

import { requireAdmin } from '../../../lib/auth/middleware.js';
import { handleInvite } from './handler.js';
import type { InviteClient } from './handler.js';

const rawClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(rawClient);
const tableName = process.env.MAIN_TABLE_NAME ?? 'CourseForgeRuns';

const client: InviteClient = {
  async put(params) {
    await ddb.send(new PutCommand(params));
  },
};

export const POST = requireAdmin(async (request: NextRequest, ctx) => {
  try {
    const body = await request.json();
    const result = await handleInvite(client, tableName, body, ctx);
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
