import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { NextRequest, NextResponse } from 'next/server';

import { createV1RunHandler, type V1RunRepository, type V1RunRecord, type V1RunStep } from '../../../../../src/api/v1/runs.js';
import { tenantPK } from '../../../../../src/models/schema.js';
import { runV1Middleware, client, tableName } from '../../_middleware.js';

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
    // Find the run record under the tenant partition
    const runResult = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      FilterExpression: 'runId = :runId',
      ExpressionAttributeValues: { ':pk': tenantPK(tenantId), ':prefix': 'RUN#', ':runId': runId },
    }));
    const item = runResult.Items?.[0];
    if (!item) return null;

    // Fetch steps from the RUN#{runId} partition
    const stepResult = await client.send(new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': `RUN#${runId}`, ':prefix': 'STEP#' },
      ScanIndexForward: true,
    }));

    const steps: V1RunStep[] = (stepResult.Items ?? []).map((s) => ({
      stepId: String((s as Record<string, unknown>).stepId),
      stepIndex: Number((s as Record<string, unknown>).stepIndex ?? 0),
      status: String((s as Record<string, unknown>).status),
      startedAt: String((s as Record<string, unknown>).startedAt ?? ''),
      completedAt: (s as Record<string, unknown>).completedAt ? String((s as Record<string, unknown>).completedAt) : null,
      rawInput: (s as Record<string, unknown>).rawInput as Record<string, unknown> | undefined,
      rawOutput: (s as Record<string, unknown>).rawOutput as Record<string, unknown> | undefined,
    }));

    const run = item as unknown as V1RunRecord;
    return { ...run, steps };
  },
};

const handler = createV1RunHandler(runRepo);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  const mw = await runV1Middleware(request, 'GET', `/api/v1/runs/${runId}`);
  if (mw.error) return mw.error;

  const result = await handler.getById(mw.auth.tenantId, runId);
  return new NextResponse(result.body, { status: result.statusCode, headers: result.headers });
}
