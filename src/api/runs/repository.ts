import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import type { Run, RunStep } from '../../../packages/types/src/runs';
import { findRunRecordById } from '../../../functions/shared/run-records';
import type { RunRepository } from './handler';
import { decodeCursor, type RunsQueryParams } from './validation';

interface QueryOptions {
  tenantId: string;
  params: RunsQueryParams;
  filterExpression?: string;
  expressionAttributeNames?: Record<string, string>;
  expressionAttributeValues?: Record<string, unknown>;
}

function toRun(item: Record<string, unknown>): Run {
  return {
    runId: String(item.runId),
    workflowId: String(item.workflowId),
    workflowName: String(item.workflowName ?? item.workflowId ?? 'Unknown workflow'),
    tenantId: String(item.tenantId),
    versionId: String(item.versionId ?? ''),
    status: String(item.status) as Run['status'],
    triggerType: String(item.triggerType ?? 'webhook') as Run['triggerType'],
    triggerEventId: String(item.triggerEventId ?? ''),
    startedAt: String(item.startedAt ?? item.createdAt ?? ''),
    endedAt: item.endedAt ? String(item.endedAt) : undefined,
    durationMs: typeof item.durationMs === 'number' ? item.durationMs : undefined,
    parentRunId: item.parentRunId ? String(item.parentRunId) : undefined,
    failedStepId: item.failedStepId ? String(item.failedStepId) : undefined,
  };
}

function toRunStep(item: Record<string, unknown>): RunStep {
  const inputSummary = item.inputSummary ?? item.input ?? item.params ?? null;
  const outputSummary = item.outputSummary ?? item.output ?? null;
  const error = typeof item.error === 'object' && item.error !== null
    ? (item.error as Record<string, unknown>)
    : undefined;

  return {
    stepId: String(item.stepId),
    stepIndex: Number(item.stepIndex ?? 0),
    label: String(item.label ?? item.stepId ?? item.actionType ?? item.connectorKey ?? 'Step'),
    connectorKey: String(item.connectorKey ?? ''),
    status: String(item.status) as RunStep['status'],
    startedAt: String(item.startedAt ?? ''),
    endedAt: item.endedAt ? String(item.endedAt) : undefined,
    inputSummary:
      typeof inputSummary === 'string'
        ? inputSummary
        : JSON.stringify(inputSummary, null, 2),
    outputSummary:
      typeof outputSummary === 'string'
        ? outputSummary
        : JSON.stringify(outputSummary, null, 2),
    errorMessage: typeof error?.message === 'string' ? error.message : undefined,
    errorCode: typeof error?.code === 'string' ? error.code : undefined,
    rawResponse:
      typeof error?.rawResponse === 'string'
        ? error.rawResponse
        : error?.rawResponse !== undefined
          ? JSON.stringify(error.rawResponse, null, 2)
          : undefined,
  };
}

function isWithinDateRange(run: Run, params: RunsQueryParams): boolean {
  if (params.dateFrom && run.startedAt < params.dateFrom) {
    return false;
  }

  if (params.dateTo && run.startedAt > `${params.dateTo}T23:59:59.999Z`) {
    return false;
  }

  return true;
}

async function queryRuns(
  client: Pick<DynamoDBDocumentClient, 'send'>,
  tableName: string,
  options: QueryOptions,
): Promise<{ items: Run[]; lastKey?: Record<string, unknown> }> {
  const cursor = options.params.cursor ? decodeCursor(options.params.cursor) : undefined;
  const result = await client.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeNames: options.expressionAttributeNames,
      ExpressionAttributeValues: {
        ':pk': `TENANT#${options.tenantId}`,
        ':skPrefix': 'RUN#',
        ...(options.expressionAttributeValues ?? {}),
      },
      FilterExpression: options.filterExpression,
      ExclusiveStartKey: cursor ?? undefined,
      Limit: options.params.limit ?? 50,
      ScanIndexForward: false,
    }),
  );

  const items = (result.Items ?? [])
    .map((item) => toRun(item as Record<string, unknown>))
    .filter((run) => isWithinDateRange(run, options.params));

  return {
    items,
    lastKey: result.LastEvaluatedKey as Record<string, unknown> | undefined,
  };
}

export function createDynamoRunRepository(
  client: Pick<DynamoDBDocumentClient, 'send'>,
  tableName: string,
): RunRepository {
  return {
    queryByTenant(tenantId, params) {
      return queryRuns(client, tableName, { tenantId, params });
    },

    queryByWorkflow(tenantId, workflowId, params) {
      return queryRuns(client, tableName, {
        tenantId,
        params,
        filterExpression: 'workflowId = :workflowId',
        expressionAttributeValues: {
          ':workflowId': workflowId,
        },
      });
    },

    queryByTenantStatus(tenantId, status, params) {
      return queryRuns(client, tableName, {
        tenantId,
        params,
        filterExpression: '#status = :status',
        expressionAttributeNames: {
          '#status': 'status',
        },
        expressionAttributeValues: {
          ':status': status,
        },
      });
    },

    async getById(tenantId, runId) {
      const item = await findRunRecordById(
        {
          query: async (params) => {
            const result = await client.send(new QueryCommand(params));
            return { Items: result.Items as Array<Record<string, unknown>> | undefined };
          },
        },
        tableName,
        tenantId,
        runId,
      );

      return item ? toRun(item) : null;
    },

    async getSteps(runId) {
      const result = await client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
          ExpressionAttributeValues: {
            ':pk': `RUN#${runId}`,
            ':prefix': 'STEP#',
          },
          ScanIndexForward: true,
        }),
      );

      return (result.Items ?? []).map((item) => toRunStep(item as Record<string, unknown>));
    },
  };
}
