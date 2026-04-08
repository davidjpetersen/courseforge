/**
 * POST /api/team/accept-invite
 *
 * Thin Next.js route wrapper around the accept-invite handler.
 * Public endpoint (no auth required — the invite token is the credential).
 */

import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

import { setSessionCookie } from '../../../lib/auth/jwt.js';
import { handleAcceptInvite } from './handler.js';
import type { AcceptInviteClient } from './handler.js';

const rawClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(rawClient);
const tableName = process.env.MAIN_TABLE_NAME ?? 'CourseForgeRuns';

const client: AcceptInviteClient = {
  async get(params) {
    const result = await ddb.send(new GetCommand(params));
    return { Item: result.Item as Record<string, unknown> | undefined };
  },
  async put(params) {
    await ddb.send(new PutCommand(params));
  },
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenantId, ...input } = body;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
    }

    const result = await handleAcceptInvite(client, tableName, input, tenantId);

    const response = NextResponse.json(result.body, { status: result.status });

    if (result.token) {
      setSessionCookie(response, result.token);
    }

    return response;
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
