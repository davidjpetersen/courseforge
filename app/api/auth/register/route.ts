/**
 * POST /api/auth/register
 *
 * Thin Next.js route wrapper around the registration handler.
 */

import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

import { setSessionCookie } from '../../../lib/auth/jwt.js';
import { handleRegister } from './handler.js';
import type { RegisterClient } from './handler.js';

const rawClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(rawClient);
const tableName = process.env.MAIN_TABLE_NAME ?? 'CourseForgeRuns';

/** Adapt DynamoDBDocumentClient to the RegisterClient interface. */
const client: RegisterClient = {
  async put(params) {
    await ddb.send(new PutCommand(params));
  },
  async get(params) {
    const result = await ddb.send(new GetCommand(params));
    return { Item: result.Item as Record<string, unknown> | undefined };
  },
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await handleRegister(client, tableName, body);

    const response = NextResponse.json(result.body, { status: result.status });

    if (result.token) {
      setSessionCookie(response, result.token);
    }

    return response;
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
