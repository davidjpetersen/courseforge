import { auditEntryPK, auditEntrySK } from '../shared/keys.js';
import { findRunRecordById } from '../shared/run-records.js';
import type { AuditEntry, RunFinalizerInput, RunFinalizerOutput } from '../shared/types.js';

export interface DynamoClientLike {
  query(params: {
    TableName: string;
    KeyConditionExpression: string;
    ExpressionAttributeValues: Record<string, unknown>;
    FilterExpression?: string;
    Limit?: number;
  }): Promise<{ Items?: Array<Record<string, unknown>> }>;
  update(params: {
    TableName: string;
    Key: Record<string, unknown>;
    UpdateExpression: string;
    ExpressionAttributeValues: Record<string, unknown>;
    ExpressionAttributeNames?: Record<string, string>;
  }): Promise<unknown>;
  put(params: { TableName: string; Item: Record<string, unknown> }): Promise<unknown>;
}

export interface EventBridgeClientLike {
  putEvents(params: {
    Entries: Array<{
      EventBusName: string;
      Source: string;
      DetailType: string;
      Detail: string;
    }>;
  }): Promise<unknown>;
}

export interface RunFinalizerDeps {
  dynamoClient: DynamoClientLike;
  eventBridgeClient: EventBridgeClientLike;
  mainTableName: string;
  eventBusName: string;
  clock?: () => Date;
}

export function createRunFinalizerHandler(deps: RunFinalizerDeps) {
  const now = deps.clock ?? (() => new Date());

  return async (input: RunFinalizerInput): Promise<RunFinalizerOutput> => {
    const runRecord = await findRunRecordById(
      deps.dynamoClient,
      deps.mainTableName,
      input.tenantId,
      input.runId,
    );

    if (!runRecord) {
      throw new Error(`run not found: ${input.runId}`);
    }

    const endedAt = now().toISOString();
    const startedAt = typeof runRecord.startedAt === 'string' ? Date.parse(runRecord.startedAt) : NaN;
    const durationMs = Number.isFinite(startedAt) ? Math.max(0, Date.parse(endedAt) - startedAt) : 0;

    await deps.dynamoClient.update({
      TableName: deps.mainTableName,
      Key: { PK: runRecord.PK, SK: runRecord.SK },
      UpdateExpression:
        'SET #status = :status, endedAt = :endedAt, durationMs = :durationMs, failedStepId = :failedStepId, errorMessage = :errorMessage, errorCode = :errorCode',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': input.status,
        ':endedAt': endedAt,
        ':durationMs': durationMs,
        ':failedStepId': input.error?.failedStepId ?? null,
        ':errorMessage': input.error?.errorMessage ?? null,
        ':errorCode': input.error?.errorCode ?? null,
      },
    });

    const auditEntry: AuditEntry = {
      PK: auditEntryPK(input.tenantId),
      SK: auditEntrySK(endedAt, input.runId),
      tenantId: input.tenantId,
      actionType: input.status === 'SUCCESS' ? 'RUN_COMPLETED' : 'RUN_FAILED',
      runId: input.runId,
      workflowId: input.workflowId,
      status: input.status,
      durationMs,
      createdAt: endedAt,
    };

    await deps.dynamoClient.put({
      TableName: deps.mainTableName,
      Item: auditEntry as unknown as Record<string, unknown>,
    });

    await deps.eventBridgeClient.putEvents({
      Entries: [
        {
          EventBusName: deps.eventBusName,
          Source: 'courseforge.run',
          DetailType: input.status === 'SUCCESS' ? 'RunCompleted' : 'RunFailed',
          Detail: JSON.stringify({
            tenantId: input.tenantId,
            workflowId: input.workflowId,
            runId: input.runId,
            status: input.status,
            durationMs,
          }),
        },
      ],
    });

    return { runId: input.runId, status: input.status };
  };
}
