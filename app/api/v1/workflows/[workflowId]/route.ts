import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { NextRequest, NextResponse } from 'next/server';

import { createV1WorkflowHandler, type V1WorkflowRepository, type V1WorkflowRecord } from '../../../../../src/api/v1/workflows';
import { tenantPK } from '../../../../../src/models/schema';
import { runV1Middleware, client, tableName } from '../../_middleware';

const workflowRepo: V1WorkflowRepository = {
  async create(workflow: V1WorkflowRecord) {
    await client.send(new PutCommand({
      TableName: tableName,
      Item: { PK: tenantPK(workflow.tenantId), SK: `WORKFLOW#${workflow.workflowId}`, ...workflow },
    }));
  },
  async list(tenantId: string) {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': tenantPK(tenantId), ':prefix': 'WORKFLOW#' },
    }));
    return (result.Items ?? []) as unknown as V1WorkflowRecord[];
  },
  async getById(tenantId: string, workflowId: string) {
    const result = await client.send(new GetCommand({
      TableName: tableName,
      Key: { PK: tenantPK(tenantId), SK: `WORKFLOW#${workflowId}` },
    }));
    return (result.Item as unknown as V1WorkflowRecord) ?? null;
  },
  async publish(tenantId: string, workflowId: string) {
    try {
      const result = await client.send(new UpdateCommand({
        TableName: tableName,
        Key: { PK: tenantPK(tenantId), SK: `WORKFLOW#${workflowId}` },
        UpdateExpression: 'SET #status = :status, updatedAt = :now',
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': 'PUBLISHED', ':now': new Date().toISOString() },
        ReturnValues: 'ALL_NEW',
      }));
      return (result.Attributes as unknown as V1WorkflowRecord) ?? null;
    } catch {
      return null;
    }
  },
};

const handler = createV1WorkflowHandler(workflowRepo);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ workflowId: string }> },
) {
  const { workflowId } = await context.params;
  const mw = await runV1Middleware(request, 'GET', `/api/v1/workflows/${workflowId}`);
  if (mw.error) return mw.error;

  const result = await handler.getById(mw.auth.tenantId, workflowId);
  return new NextResponse(result.body, { status: result.statusCode, headers: result.headers });
}
