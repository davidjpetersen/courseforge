import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { NextRequest, NextResponse } from 'next/server';

import {
  createListWorkflowsByEnvHandler,
  type WorkflowRepository,
} from '../../../../../src/api/environments/handler';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.MAIN_TABLE_NAME ?? 'CourseForgeRuns';

function normalizeTenantId(rawTenantId: string): string {
  return rawTenantId.startsWith('TENANT#') ? rawTenantId.slice('TENANT#'.length) : rawTenantId;
}

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

const handler = createListWorkflowsByEnvHandler(wfRepo);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ environmentId: string }> },
) {
  const { environmentId } = await context.params;
  const tenantId = normalizeTenantId(request.headers.get('x-tenant-id') ?? 'CURRENT');
  const result = await handler({
    httpMethod: 'GET',
    path: `/api/environments/${environmentId}/workflows`,
    headers: { 'x-tenant-id': tenantId },
    pathParameters: { environmentId },
    queryStringParameters: Object.fromEntries(request.nextUrl.searchParams.entries()),
  });

  return new NextResponse(result.body, {
    status: result.statusCode,
    headers: result.headers,
  });
}
