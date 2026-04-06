import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { NextRequest, NextResponse } from 'next/server';

import { createRunsHandler } from '../../../src/api/runs/handler.js';
import { createDynamoRunRepository } from '../../../src/api/runs/repository.js';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.MAIN_TABLE_NAME ?? process.env.RUNS_TABLE_NAME ?? 'CourseForgeRuns';
const repo = createDynamoRunRepository(client, tableName);
const handler = createRunsHandler(repo);

export async function GET(request: NextRequest) {
  const queryStringParameters = Object.fromEntries(request.nextUrl.searchParams.entries());
  const result = await handler({
    httpMethod: 'GET',
    path: '/api/runs',
    headers: {
      'x-tenant-id': request.headers.get('x-tenant-id') ?? 'CURRENT',
    },
    queryStringParameters,
  });

  return new NextResponse(result.body, {
    status: result.statusCode,
    headers: result.headers,
  });
}
