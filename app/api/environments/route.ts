import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { NextRequest, NextResponse } from 'next/server';
import { tenantPK, TABLE_NAME } from '../../../src/models/schema.js';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export async function GET(request: NextRequest): Promise<NextResponse> {
  const tenantId = request.headers.get('x-tenant-id');
  if (!tenantId) {
    return NextResponse.json({ message: 'Missing tenant context' }, { status: 401 });
  }

  const envResult = await dynamo.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :env)',
      ExpressionAttributeValues: {
        ':pk': tenantPK(tenantId),
        ':env': 'ENV#',
      },
    }),
  );

  const wfResult = await dynamo.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :wf)',
      ExpressionAttributeValues: {
        ':pk': tenantPK(tenantId),
        ':wf': 'WORKFLOW#',
      },
    }),
  );

  const workflowCounts = (wfResult.Items ?? []).reduce<Record<string, number>>((acc, item) => {
    const environmentId = item.environmentId ?? 'dev';
    acc[environmentId] = (acc[environmentId] ?? 0) + 1;
    return acc;
  }, {});

  const environments = (envResult.Items ?? []).map((item) => ({
    environmentId: item.environmentId,
    name: item.name,
    workflowCount: workflowCounts[item.environmentId] ?? 0,
  }));

  return NextResponse.json({ environments });
}
