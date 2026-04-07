import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { NextRequest, NextResponse } from 'next/server';

import {
  createPromoteHandler,
  type PromoteRepository,
} from '../../../../../src/api/promote/handler.js';
import { writeAuditLog } from '../../../../../packages/utils/src/audit.js';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.MAIN_TABLE_NAME ?? 'CourseForgeRuns';

function normalizeTenantId(rawTenantId: string): string {
  return rawTenantId.startsWith('TENANT#') ? rawTenantId.slice('TENANT#'.length) : rawTenantId;
}

const repo: PromoteRepository = {
  async getWorkflow(tenantId: string, workflowId: string) {
    const result = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: {
          PK: `TENANT#${tenantId}`,
          SK: `WORKFLOW#${workflowId}`,
        },
      }),
    );
    if (!result.Item) return null;
    return {
      workflowId: String(result.Item.workflowId),
      tenantId: String(result.Item.tenantId),
      name: String(result.Item.name ?? ''),
      environmentId: String(result.Item.environmentId ?? ''),
      status: String(result.Item.status ?? ''),
      createdBy: String(result.Item.createdBy ?? ''),
    };
  },
  async getLatestVersion(workflowId: string) {
    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
          ':pk': `WORKFLOW#${workflowId}`,
          ':prefix': 'VERSION#',
        },
        ScanIndexForward: false,
        Limit: 1,
      }),
    );
    const item = result.Items?.[0];
    if (!item) return null;
    return {
      workflowId: String(item.workflowId),
      version: String(item.version),
      compiledPlan: (item.compiledPlan as Record<string, unknown>) ?? {},
    };
  },
  async createWorkflow(record) {
    await client.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          PK: `TENANT#${record.tenantId}`,
          SK: `WORKFLOW#${record.workflowId}`,
          ...record,
        },
      }),
    );
  },
  async createVersion(record) {
    await client.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          PK: `WORKFLOW#${record.workflowId}`,
          SK: `VERSION#${record.version}`,
          ...record,
        },
      }),
    );
  },
};

const auditClient = {
  async write(entry: Parameters<typeof writeAuditLog>[2]) {
    await writeAuditLog({ put: async (params) => { await client.send(new PutCommand(params)); } }, tableName, entry);
  },
};

const handler = createPromoteHandler(repo, auditClient);

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workflowId: string }> },
) {
  const { workflowId } = await context.params;
  const tenantId = normalizeTenantId(request.headers.get('x-tenant-id') ?? 'CURRENT');

  const result = await handler({
    httpMethod: 'POST',
    path: `/api/workflows/${workflowId}/promote`,
    headers: {
      'x-tenant-id': tenantId,
      'x-forwarded-for': request.headers.get('x-forwarded-for') ?? '',
      'user-agent': request.headers.get('user-agent') ?? '',
    },
    pathParameters: { workflowId },
    body: null,
  });

  return new NextResponse(result.body, {
    status: result.statusCode,
    headers: result.headers,
  });
}
