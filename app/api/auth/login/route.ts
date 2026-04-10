/**
 * POST /api/auth/login
 *
 * Thin Next.js route wrapper around the login handler.
 */

import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

import { setSessionCookie } from '../../../lib/auth/jwt';
import { handleLogin } from './handler';
import type { LoginClient } from './handler';

const rawClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(rawClient);
const tableName = process.env.MAIN_TABLE_NAME ?? 'CourseForgeRuns';

const client: LoginClient = {
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
    const result = await handleLogin(client, tableName, body);

    const response = NextResponse.json(result.body, { status: result.status });

    if (result.token) {
      setSessionCookie(response, result.token);
    }

    return response;
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
