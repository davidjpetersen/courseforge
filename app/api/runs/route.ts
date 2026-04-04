import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { NextRequest, NextResponse } from 'next/server';

import type { Run } from '../../../packages/types/src/runs';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.RUNS_TABLE_NAME ?? 'CourseForgeRuns';

function sanitizeRunListItem(item: Record<string, unknown>): Run {
  return {
    runId: String(item.runId),
    workflowId: String(item.workflowId),
    workflowName: String(item.workflowName ?? 'Unknown workflow'),
    tenantId: String(item.tenantId),
    versionId: String(item.versionId ?? ''),
    status: item.status as Run['status'],
    triggerType: item.triggerType as Run['triggerType'],
    triggerEventId: String(item.triggerEventId ?? ''),
    startedAt: String(item.startedAt),
    endedAt: item.endedAt ? String(item.endedAt) : undefined,
    durationMs: typeof item.durationMs === 'number' ? item.durationMs : undefined,
    parentRunId: item.parentRunId ? String(item.parentRunId) : undefined,
    failedStepId: item.failedStepId ? String(item.failedStepId) : undefined,
  };
}

function sortRuns(runs: Run[]): Run[] {
  return [...runs].sort((a, b) => {
    const aDay = a.startedAt.slice(0, 10);
    const bDay = b.startedAt.slice(0, 10);
    if (aDay !== bDay) {
      return bDay.localeCompare(aDay);
    }

    if (a.status === 'FAILED' && b.status !== 'FAILED') return -1;
    if (b.status === 'FAILED' && a.status !== 'FAILED') return 1;
    return b.startedAt.localeCompare(a.startedAt);
  });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const workflowId = params.get('workflowId') ?? undefined;
  const status = params.get('status') ?? undefined;
  const dateFrom = params.get('dateFrom') ?? undefined;
  const dateTo = params.get('dateTo') ?? undefined;
  const limit = Number(params.get('limit') ?? '50');
  const cursor = params.get('cursor') ?? undefined;

  const command = new QueryCommand({
    TableName: tableName,
    IndexName: status ? 'GSI_TENANT_STATUS' : 'GSI_WORKFLOW_RUNS',
    KeyConditionExpression: status
      ? 'tenantId = :tenantId AND #status = :status'
      : 'workflowId = :workflowId',
    ExpressionAttributeNames: status ? { '#status': 'status' } : undefined,
    ExpressionAttributeValues: status
      ? { ':tenantId': 'TENANT#CURRENT', ':status': status }
      : { ':workflowId': workflowId ?? 'WORKFLOW#ALL' },
    ExclusiveStartKey: cursor ? JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) : undefined,
    Limit: Number.isFinite(limit) ? limit : 50,
    ScanIndexForward: false,
  });

  const response = await client.send(command);
  const runs = (response.Items ?? [])
    .map((item) => sanitizeRunListItem(item as Record<string, unknown>))
    .filter((run) => {
      if (dateFrom && run.startedAt < dateFrom) return false;
      if (dateTo && run.startedAt > `${dateTo}T23:59:59.999Z`) return false;
      return true;
    });

  return NextResponse.json({
    runs: sortRuns(runs),
    nextCursor: response.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(response.LastEvaluatedKey), 'utf8').toString('base64url')
      : undefined,
  });
}
