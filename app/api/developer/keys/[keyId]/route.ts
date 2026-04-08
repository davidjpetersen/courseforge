import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { NextRequest, NextResponse } from 'next/server';

import { createApiKeyHandler } from '../../../../../src/api/developer-keys/handler.js';
import { createDynamoApiKeyRepository } from '../../../../../src/api/developer-keys/repository.js';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.MAIN_TABLE_NAME ?? 'CourseForgeRuns';
const repo = createDynamoApiKeyRepository(client, tableName);
const handler = createApiKeyHandler(repo);

function normalizeTenantId(rawTenantId: string): string {
  return rawTenantId.startsWith('TENANT#') ? rawTenantId.slice('TENANT#'.length) : rawTenantId;
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ keyId: string }> },
) {
  const { keyId } = await context.params;
  const tenantId = normalizeTenantId(request.headers.get('x-tenant-id') ?? 'CURRENT');

  const result = await handler.revoke(tenantId, keyId);

  return new NextResponse(result.body, {
    status: result.statusCode,
    headers: result.headers,
  });
}
