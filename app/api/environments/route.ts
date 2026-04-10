import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { NextRequest, NextResponse } from 'next/server';

import {
  createListEnvironmentsHandler,
  type EnvironmentRepository,
  type WorkflowRepository,
} from '../../../src/api/environments/handler';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.MAIN_TABLE_NAME ?? 'CourseForgeRuns';

function normalizeTenantId(rawTenantId: string): string {
  return rawTenantId.startsWith('TENANT#') ? rawTenantId.slice('TENANT#'.length) : rawTenantId;
}

const envRepo: EnvironmentRepository = {
  async listByTenant(tenantId: string) {
    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
          ':pk': `TENANT#${tenantId}`,
          ':prefix': 'ENV#',
        },
      }),
    );
    return (result.Items ?? []).map((item) => ({
      environmentId: String(item.environmentId),
      tenantId: String(item.tenantId),
      name: String(item.name ?? ''),
      description: String(item.description ?? ''),
      isDefault: Boolean(item.isDefault),
      createdAt: String(item.createdAt ?? ''),
    }));
  },
  async countByTenant(tenantId: string) {
    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
          ':pk': `TENANT#${tenantId}`,
          ':prefix': 'ENV#',
        },
        Select: 'COUNT',
      }),
    );
    return result.Count ?? 0;
  },
};

const wfRepo: WorkflowRepository = {
  async countByEnvironment(tenantId: string, environmentId: string) {
    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        FilterExpression: 'environmentId = :envId',
        ExpressionAttributeValues: {
          ':pk': `TENANT#${tenantId}`,
          ':prefix': 'WORKFLOW#',
          ':envId': environmentId,
        },
        Select: 'COUNT',
      }),
    );
    return result.Count ?? 0;
  },
  async listByEnvironment(tenantId: string, environmentId: string) {
    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        FilterExpression: 'environmentId = :envId',
        ExpressionAttributeValues: {
          ':pk': `TENANT#${tenantId}`,
          ':prefix': 'WORKFLOW#',
          ':envId': environmentId,
        },
      }),
    );
    return (result.Items ?? []).map((item) => ({
      workflowId: String(item.workflowId),
      name: String(item.name ?? ''),
      status: String(item.status ?? ''),
      environmentId: String(item.environmentId ?? ''),
    }));
  },
};

const handler = createListEnvironmentsHandler(envRepo, wfRepo);

export async function GET(request: NextRequest) {
  const tenantId = normalizeTenantId(request.headers.get('x-tenant-id') ?? 'CURRENT');
  const result = await handler({
    httpMethod: 'GET',
    path: '/api/environments',
    headers: { 'x-tenant-id': tenantId },
    queryStringParameters: Object.fromEntries(request.nextUrl.searchParams.entries()),
  });

  return new NextResponse(result.body, {
    status: result.statusCode,
    headers: result.headers,
  });
}
