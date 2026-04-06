import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { NextRequest, NextResponse } from 'next/server';

import type { Run } from '../../../packages/types/src/runs';
import { RunStatus } from '../../../packages/types/src';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const tableName = process.env.RUNS_TABLE_NAME ?? 'CourseForgeRuns';
const RUN_STATUS_VALUES = new Set(Object.values(RunStatus));
const MAX_LIMIT = 100;

function normalizeTenantId(rawTenantId: string): string {
  return rawTenantId.startsWith('TENANT#') ? rawTenantId.slice('TENANT#'.length) : rawTenantId;
}

function getTenantId(request: NextRequest): string {
  return normalizeTenantId(
    request.headers.get('x-tenant-id') ??
      process.env.DEFAULT_TENANT_ID ??
      'CURRENT',
  );
}

function encodeCursor(cursor: Record<string, unknown> | undefined): string | undefined {
  if (!cursor) {
    return undefined;
  }

  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | null): Record<string, unknown> | undefined {
  if (!cursor) {
    return undefined;
  }

  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new Error('Invalid cursor');
  }
}

function parseStatuses(request: NextRequest): Run['status'][] {
  const values = request.nextUrl.searchParams
    .getAll('status')
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);

  const unique = [...new Set(values)];
  for (const value of unique) {
    if (!RUN_STATUS_VALUES.has(value as RunStatus)) {
      throw new Error(`Invalid status value: ${value}`);
    }
  }

  return unique as Run['status'][];
}

function parseDate(value: string | null, name: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`${name} must be a valid ISO 8601 date`);
  }

  return new Date(parsed).toISOString();
}

function parseLimit(value: string | null): number {
  if (!value) {
    return 50;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('limit must be a positive number');
  }

  return Math.min(parsed, MAX_LIMIT);
}

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
  try {
    const params = request.nextUrl.searchParams;
    const workflowId = params.get('workflowId')?.trim() || undefined;
    const statuses = parseStatuses(request);
    const dateFrom = parseDate(params.get('dateFrom'), 'dateFrom');
    const dateTo = parseDate(params.get('dateTo'), 'dateTo');
    const limit = parseLimit(params.get('limit'));
    const cursor = decodeCursor(params.get('cursor'));
    const tenantId = getTenantId(request);
    const tenantKey = `TENANT#${tenantId}`;

    const command = workflowId
      ? new QueryCommand({
          TableName: tableName,
          IndexName: 'GSI_WORKFLOW_RUNS',
          KeyConditionExpression: 'workflowId = :workflowId',
          ExpressionAttributeValues: {
            ':workflowId': workflowId,
          },
          ExclusiveStartKey: cursor,
          Limit: limit,
          ScanIndexForward: false,
        })
      : statuses.length === 1
        ? new QueryCommand({
            TableName: tableName,
            IndexName: 'GSI_TENANT_STATUS',
            KeyConditionExpression: 'tenantId = :tenantId AND #status = :status',
            ExpressionAttributeNames: {
              '#status': 'status',
            },
            ExpressionAttributeValues: {
              ':tenantId': tenantKey,
              ':status': statuses[0],
            },
            ExclusiveStartKey: cursor,
            Limit: limit,
            ScanIndexForward: false,
          })
        : new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
            ExpressionAttributeValues: {
              ':pk': tenantKey,
              ':skPrefix': 'RUN#',
            },
            ExclusiveStartKey: cursor,
            Limit: limit,
            ScanIndexForward: false,
          });

    const response = await client.send(command);
    const runs = (response.Items ?? [])
      .map((item) => sanitizeRunListItem(item as Record<string, unknown>))
      .filter((run) => normalizeTenantId(run.tenantId) === tenantId)
      .filter((run) => {
        if (statuses.length > 0 && !statuses.includes(run.status)) {
          return false;
        }

        if (dateFrom && run.startedAt < dateFrom) {
          return false;
        }

        if (dateTo) {
          const inclusiveDateTo = `${dateTo.slice(0, 10)}T23:59:59.999Z`;
          if (run.startedAt > inclusiveDateTo) {
            return false;
          }
        }

        return true;
      });

    return NextResponse.json({
      runs: sortRuns(runs),
      nextCursor: encodeCursor(response.LastEvaluatedKey as Record<string, unknown> | undefined),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request';
    return NextResponse.json({ message }, { status: 400 });
  }
}
