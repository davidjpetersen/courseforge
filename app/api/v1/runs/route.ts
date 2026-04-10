import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { NextRequest, NextResponse } from 'next/server';

import { createV1RunHandler, type V1RunRepository, type V1RunRecord } from '../../../../src/api/v1/runs';
import { tenantPK } from '../../../../src/models/schema';
import { runV1Middleware, client, tableName } from '../_middleware';

const runRepo: V1RunRepository = {
  async list(tenantId: string) {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': tenantPK(tenantId), ':prefix': 'RUN#' },
      ScanIndexForward: false,
    }));
    return (result.Items ?? []) as unknown as V1RunRecord[];
  },
  async getById(tenantId: string, runId: string) {
    // Query by tenant to find the run (SK includes timestamp)
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      FilterExpression: 'runId = :runId',
      ExpressionAttributeValues: { ':pk': tenantPK(tenantId), ':prefix': 'RUN#', ':runId': runId },
    }));
    const item = result.Items?.[0];
    return (item as unknown as V1RunRecord) ?? null;
  },
};

const handler = createV1RunHandler(runRepo);

export async function GET(request: NextRequest) {
  const mw = await runV1Middleware(request, 'GET', '/api/v1/runs');
  if (mw.error) return mw.error;

  const query = Object.fromEntries(request.nextUrl.searchParams.entries());
  const result = await handler.list(mw.auth.tenantId, query);
  return new NextResponse(result.body, { status: result.statusCode, headers: result.headers });
}
