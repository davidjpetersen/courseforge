import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { workflowPK } from '../../src/models/schema.js';

export interface StepDefinition {
  stepId: string;
  stepIndex: number;
  connectorKey: string;
  actionType: string;
  params: Record<string, unknown>;
  retryPolicy?: Record<string, unknown>;
}

export interface RunInitializerEvent {
  tenantId: string;
  workflowId: string;
  runId: string;
  traceId: string;
  payload: unknown;
}

export interface RunInitializerDeps {
  dynamoClient: Pick<DynamoDBDocumentClient, 'send'>;
  mainTableName: string;
  clock?: () => Date;
}

export function createRunInitializerHandler(deps: RunInitializerDeps) {
  const now = deps.clock ?? (() => new Date());

  return async (event: RunInitializerEvent): Promise<{
    steps: StepDefinition[];
    workflowId: string;
    runId: string;
    tenantId: string;
    traceId: string;
    payload: unknown;
  }> => {
    const workflowMeta = await deps.dynamoClient.send(
      new GetCommand({
        TableName: deps.mainTableName,
        Key: {
          PK: workflowPK(event.workflowId),
          SK: 'META',
        },
      }),
    );

    if (!workflowMeta.Item) {
      throw new Error(`Workflow ${event.workflowId} was not found`);
    }

    const versionId = workflowMeta.Item.publishedVersionId as string | undefined;
    if (!versionId) {
      throw new Error(`Workflow ${event.workflowId} has no published version`);
    }

    const versionRecord = await deps.dynamoClient.send(
      new GetCommand({
        TableName: deps.mainTableName,
        Key: {
          PK: `WORKFLOW#${event.workflowId}`,
          SK: `VERSION#${versionId}`,
        },
      }),
    );

    if (!versionRecord.Item) {
      throw new Error(`Published workflow version ${versionId} was not found`);
    }

    const steps = (versionRecord.Item.compiledPlan ?? []) as StepDefinition[];
    const startedAt = now().toISOString();

    await deps.dynamoClient.send(
      new UpdateCommand({
        TableName: deps.mainTableName,
        Key: {
          PK: `RUN#${event.runId}`,
          SK: 'META',
        },
        UpdateExpression: 'SET #status = :status, versionId = :versionId, startedAt = :startedAt',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': 'RUNNING',
          ':versionId': versionId,
          ':startedAt': startedAt,
        },
      }),
    );

    return {
      steps,
      workflowId: event.workflowId,
      runId: event.runId,
      tenantId: event.tenantId,
      traceId: event.traceId,
      payload: event.payload,
    };
  };
}

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = createRunInitializerHandler({
  dynamoClient: client,
  mainTableName: process.env.MAIN_TABLE_NAME ?? '',
});
