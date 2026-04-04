import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { NextRequest, NextResponse } from 'next/server';
import { tenantPK, TABLE_NAME } from '../../../../../src/models/schema.js';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ environmentId: 'dev' | 'prod' }> },
): Promise<NextResponse> {
  const { environmentId } = await context.params;
  const tenantId = request.headers.get('x-tenant-id');

  if (!tenantId) {
    return NextResponse.json({ message: 'Missing tenant context' }, { status: 401 });
  }

  const result = await dynamo.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :wf)',
      FilterExpression: 'environmentId = :environmentId',
      ExpressionAttributeValues: {
        ':pk': tenantPK(tenantId),
        ':wf': 'WORKFLOW#',
        ':environmentId': environmentId,
      },
    }),
  );

  return NextResponse.json({ workflows: result.Items ?? [], environmentId });
}
