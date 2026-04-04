import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { NextRequest, NextResponse } from 'next/server';
import { tenantPK, TABLE_NAME } from '../../../src/models/schema.js';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function isAdmin(request: NextRequest): boolean {
  return request.headers.get('x-user-role') === 'Admin';
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAdmin(request)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const tenantId = request.headers.get('x-tenant-id');
  if (!tenantId) {
    return NextResponse.json({ message: 'Missing tenant context' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get('limit') ?? '100');
  const actor = searchParams.get('actor');
  const actionType = searchParams.get('actionType');
  const resourceType = searchParams.get('resourceType');
  const resourceId = searchParams.get('resourceId');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const cursor = searchParams.get('cursor');

  const result = await dynamo.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :auditPrefix)',
      ExpressionAttributeValues: {
        ':pk': tenantPK(tenantId),
        ':auditPrefix': 'AUDIT#',
      },
      ExclusiveStartKey: cursor ? JSON.parse(Buffer.from(cursor, 'base64url').toString()) : undefined,
      Limit: limit,
    }),
  );

  const entries = (result.Items ?? []).filter((item) => {
    if (actor && item.actor !== actor) return false;
    if (actionType && item.actionType !== actionType) return false;
    if (resourceType && item.resourceType !== resourceType) return false;
    if (resourceId && item.resourceId !== resourceId) return false;
    if (dateFrom && item.timestamp < dateFrom) return false;
    if (dateTo && item.timestamp > dateTo) return false;
    return true;
  });

  const nextCursor = result.LastEvaluatedKey
    ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64url')
    : undefined;

  return NextResponse.json({ entries, nextCursor });
}
