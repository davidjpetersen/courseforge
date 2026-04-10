import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { NextRequest, NextResponse } from 'next/server';

import { createApiKeyHandler } from '../../../../src/api/developer-keys/handler';
import { createDynamoApiKeyRepository } from '../../../../src/api/developer-keys/repository';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.MAIN_TABLE_NAME ?? 'CourseForgeRuns';
const repo = createDynamoApiKeyRepository(client, tableName);
const handler = createApiKeyHandler(repo);

function normalizeTenantId(rawTenantId: string): string {
  return rawTenantId.startsWith('TENANT#') ? rawTenantId.slice('TENANT#'.length) : rawTenantId;
}

export async function POST(request: NextRequest) {
  const tenantId = normalizeTenantId(request.headers.get('x-tenant-id') ?? 'CURRENT');
  const createdBy = request.headers.get('x-user-id') ?? 'unknown';
  const body = await request.json();

  const result = await handler.create(tenantId, createdBy, body);

  return new NextResponse(result.body, {
    status: result.statusCode,
    headers: result.headers,
  });
}

export async function GET(request: NextRequest) {
  const tenantId = normalizeTenantId(request.headers.get('x-tenant-id') ?? 'CURRENT');

  const result = await handler.list(tenantId);

  return new NextResponse(result.body, {
    status: result.statusCode,
    headers: result.headers,
  });
}
