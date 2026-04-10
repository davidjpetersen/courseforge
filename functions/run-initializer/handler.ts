import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

import { RunStatus } from '../../packages/types/src/index';
import { tenantPK, workflowSK } from '../../src/models/schema';
import { findRunRecordById } from '../shared/run-records';
import type { RunInitializerInput, RunInitializerOutput, StepDefinition } from '../shared/types';

export interface DynamoClientLike {
  get(params: {
    TableName: string;
    Key: Record<string, unknown>;
  }): Promise<{ Item?: Record<string, unknown> }>;
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
}

export interface RunInitializerDeps {
  dynamoClient: DynamoClientLike;
  mainTableName: string;
  clock?: () => Date;
}

interface WorkflowVersionRecordLike {
  versionId?: unknown;
  compiledPlan?: unknown;
}

function parseCompiledPlan(compiledPlan: unknown): StepDefinition[] {
  if (typeof compiledPlan === 'string') {
    return JSON.parse(compiledPlan) as StepDefinition[];
  }

  if (Array.isArray(compiledPlan)) {
    return compiledPlan as StepDefinition[];
  }

  return [];
}

export function createRunInitializerHandler(deps: RunInitializerDeps) {
  const now = deps.clock ?? (() => new Date());

  return async (input: RunInitializerInput): Promise<RunInitializerOutput> => {
    const workflowMeta = await deps.dynamoClient.get({
      TableName: deps.mainTableName,
      Key: {
        PK: tenantPK(input.tenantId),
        SK: workflowSK(input.workflowId),
      },
    });

    if (!workflowMeta.Item) {
      throw new Error('workflow not found');
    }

    const versionId = workflowMeta.Item.currentVersionId;
    if (
      workflowMeta.Item.status !== 'PUBLISHED' ||
      typeof versionId !== 'string' ||
      versionId.length === 0
    ) {
      throw new Error('no published version');
    }

    const versions = await deps.dynamoClient.query({
      TableName: deps.mainTableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': workflowSK(input.workflowId),
        ':skPrefix': 'VERSION#',
      },
    });

    const version = (versions.Items ?? []).find(
      (item) => (item as WorkflowVersionRecordLike).versionId === versionId,
    ) as WorkflowVersionRecordLike | undefined;

    if (!version) {
      throw new Error('no published version');
    }

    const runRecord = await findRunRecordById(
      deps.dynamoClient,
      deps.mainTableName,
      input.tenantId,
      input.runId,
    );

    if (!runRecord) {
      throw new Error(`run not found: ${input.runId}`);
    }

    const startedAt = now().toISOString();
    await deps.dynamoClient.update({
      TableName: deps.mainTableName,
      Key: {
        PK: runRecord.PK,
        SK: runRecord.SK,
      },
      UpdateExpression:
        'SET #status = :status, versionId = :versionId, startedAt = :startedAt, payload = :payload, traceId = :traceId',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':status': RunStatus.RUNNING,
        ':versionId': versionId,
        ':startedAt': startedAt,
        ':payload': input.payload,
        ':traceId': input.traceId,
      },
    });

    return {
      steps: parseCompiledPlan(version.compiledPlan),
      workflowId: input.workflowId,
      runId: input.runId,
      tenantId: input.tenantId,
      traceId: input.traceId,
      payload: input.payload,
      versionId,
    };
  };
}

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = createRunInitializerHandler({
  dynamoClient: {
    async get(params) {
      return dynamoClient.send(new GetCommand(params));
    },
    async query(params) {
      const result = await dynamoClient.send(new QueryCommand(params));
      return { Items: result.Items as Array<Record<string, unknown>> | undefined };
    },
    async update(params) {
      return dynamoClient.send(new UpdateCommand(params));
    },
  },
  mainTableName: process.env.MAIN_TABLE_NAME ?? '',
});
