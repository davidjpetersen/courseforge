import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

import type { RuntimeConnector } from '../shared/connectors.js';
import { runtimeConnectorRegistry } from '../shared/connectors.js';
import { runStepRecordPK, runStepRecordSK } from '../shared/keys.js';
import type { ExecuteStepInput, ExecuteStepOutput, RunStepError } from '../shared/types.js';

const INLINE_OUTPUT_LIMIT_BYTES = 4 * 1024;

export interface DynamoClientLike {
  put(params: { TableName: string; Item: Record<string, unknown> }): Promise<unknown>;
  query?(params: {
    TableName: string;
    KeyConditionExpression: string;
    ExpressionAttributeValues: Record<string, unknown>;
    ScanIndexForward?: boolean;
  }): Promise<{ Items?: Array<Record<string, unknown>> }>;
  update(params: {
    TableName: string;
    Key: Record<string, unknown>;
    UpdateExpression: string;
    ExpressionAttributeValues: Record<string, unknown>;
    ExpressionAttributeNames?: Record<string, string>;
  }): Promise<unknown>;
}

export interface S3ClientLike {
  putObject(params: {
    Bucket: string;
    Key: string;
    Body: string;
    ContentType: string;
  }): Promise<unknown>;
  getObject?(params: {
    Bucket: string;
    Key: string;
  }): Promise<string>;
}

export interface MetricsLike {
  putMetric(name: string, value: number, unit: string): void;
}

export interface ExecuteStepDeps {
  dynamoClient: DynamoClientLike;
  s3Client: S3ClientLike;
  mainTableName: string;
  artifactBucketName: string;
  connectors?: Map<string, RuntimeConnector>;
  clock?: () => Date;
  metrics?: MetricsLike;
}

function toRunStepError(error: unknown): RunStepError {
  const value = error as Record<string, unknown>;
  return {
    message: error instanceof Error ? error.message : 'Step execution failed',
    code: typeof value.code === 'string' ? value.code : error instanceof Error ? error.name : 'StepExecutionFailed',
    rawResponse: value.rawResponse,
  };
}

function getOutputSizeBytes(output: unknown): number {
  return Buffer.byteLength(JSON.stringify(output), 'utf8');
}

async function buildPriorStepContext(
  deps: ExecuteStepDeps,
  input: ExecuteStepInput,
): Promise<Record<string, unknown>> {
  if (!deps.dynamoClient.query) {
    return {};
  }

  const result = await deps.dynamoClient.query({
    TableName: deps.mainTableName,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: {
      ':pk': runStepRecordPK(input.runId),
      ':prefix': 'STEP#',
    },
    ScanIndexForward: true,
  });

  const priorSteps = (result.Items ?? []).filter((item) => {
    const stepIndex = typeof item.stepIndex === 'number' ? item.stepIndex : -1;
    return stepIndex < input.step.stepIndex && item.status === 'SUCCESS';
  });

  const contextEntries = await Promise.all(
    priorSteps.map(async (item) => {
      const stepId = typeof item.stepId === 'string' ? item.stepId : null;
      if (!stepId) {
        return null;
      }

      if (Object.prototype.hasOwnProperty.call(item, 'output')) {
        return [stepId, item.output] as const;
      }

      if (typeof item.outputRef === 'string' && deps.s3Client.getObject) {
        const raw = await deps.s3Client.getObject({
          Bucket: deps.artifactBucketName,
          Key: item.outputRef,
        });
        return [stepId, JSON.parse(raw) as unknown] as const;
      }

      return null;
    }),
  );

  return Object.fromEntries(
    contextEntries.filter((entry): entry is readonly [string, unknown] => entry !== null),
  );
}

export function createExecuteStepHandler(deps: ExecuteStepDeps) {
  const now = deps.clock ?? (() => new Date());
  const connectors = deps.connectors ?? runtimeConnectorRegistry;
  const metrics = deps.metrics;

  return async (input: ExecuteStepInput): Promise<ExecuteStepOutput> => {
    const startedAtIso = now().toISOString();
    const stepKey = {
      PK: runStepRecordPK(input.runId),
      SK: runStepRecordSK(input.step.stepIndex, input.step.stepId),
    };

    await deps.dynamoClient.put({
      TableName: deps.mainTableName,
      Item: {
        ...stepKey,
        runId: input.runId,
        stepId: input.step.stepId,
        stepIndex: input.step.stepIndex,
        connectorKey: input.step.connectorKey,
        status: 'RUNNING',
        startedAt: startedAtIso,
      },
    });

    const connector = connectors.get(input.step.connectorKey);
    if (!connector) {
      const error = { message: `Unknown connector: ${input.step.connectorKey}`, code: 'UnknownConnector' };
      await deps.dynamoClient.update({
        TableName: deps.mainTableName,
        Key: stepKey,
        UpdateExpression: 'SET #status = :status, endedAt = :endedAt, #error = :error',
        ExpressionAttributeNames: { '#status': 'status', '#error': 'error' },
        ExpressionAttributeValues: {
          ':status': 'FAILED',
          ':endedAt': now().toISOString(),
          ':error': error,
        },
      });
      throw Object.assign(new Error(error.message), { code: error.code, failedStepId: input.step.stepId });
    }

    const startedAtMs = Date.now();

    try {
      const priorStepContext = await buildPriorStepContext(deps, input);
      const connectorContext = {
        ...input.accumulatedContext,
        ...priorStepContext,
        tenantId: input.tenantId,
        traceId: input.traceId,
      };
      const stepResult = await connector.run(input.step.params, {
        ...connectorContext,
      });

      const endedAt = now().toISOString();
      const durationMs = Date.now() - startedAtMs;
      const outputSize = getOutputSizeBytes(stepResult);
      const accumulatedContext = {
        ...input.accumulatedContext,
        ...priorStepContext,
        [input.step.stepId]: stepResult,
      };

      if (outputSize <= INLINE_OUTPUT_LIMIT_BYTES) {
        await deps.dynamoClient.update({
          TableName: deps.mainTableName,
          Key: stepKey,
          UpdateExpression: 'SET #status = :status, endedAt = :endedAt, output = :output',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':status': 'SUCCESS',
            ':endedAt': endedAt,
            ':output': stepResult,
          },
        });
      } else {
        const outputRef = `runs/${input.runId}/steps/${input.step.stepId}/output.json`;
        await deps.s3Client.putObject({
          Bucket: deps.artifactBucketName,
          Key: outputRef,
          Body: JSON.stringify(stepResult),
          ContentType: 'application/json',
        });
        await deps.dynamoClient.update({
          TableName: deps.mainTableName,
          Key: stepKey,
          UpdateExpression: 'SET #status = :status, endedAt = :endedAt, outputRef = :outputRef',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':status': 'SUCCESS',
            ':endedAt': endedAt,
            ':outputRef': outputRef,
          },
        });
      }

      metrics?.putMetric('courseforge/StepExecutionDuration', durationMs, 'Milliseconds');
      metrics?.putMetric('courseforge/StepSuccess', 1, 'Count');

      return { accumulatedContext, stepResult };
    } catch (error) {
      const runStepError = toRunStepError(error);
      await deps.dynamoClient.update({
        TableName: deps.mainTableName,
        Key: stepKey,
        UpdateExpression: 'SET #status = :status, endedAt = :endedAt, #error = :error',
        ExpressionAttributeNames: { '#status': 'status', '#error': 'error' },
        ExpressionAttributeValues: {
          ':status': 'FAILED',
          ':endedAt': now().toISOString(),
          ':error': runStepError,
        },
      });
      metrics?.putMetric('courseforge/StepSuccess', 0, 'Count');
      throw Object.assign(error instanceof Error ? error : new Error(runStepError.message), {
        code: runStepError.code,
        rawResponse: runStepError.rawResponse,
        failedStepId: input.step.stepId,
      });
    }
  };
}

let productionHandlerPromise:
  | Promise<(input: ExecuteStepInput) => Promise<ExecuteStepOutput>>
  | undefined;

async function getProductionHandler() {
  productionHandlerPromise ??= (async () => {
    const { PutObjectCommand, S3Client } = await import('@aws-sdk/client-s3');
    const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
    const s3Client = new S3Client({});

    return createExecuteStepHandler({
      dynamoClient: {
        async put(params) {
          return dynamoClient.send(new PutCommand(params));
        },
        async query(params) {
          const result = await dynamoClient.send(new QueryCommand(params));
          return { Items: result.Items as Array<Record<string, unknown>> | undefined };
        },
        async update(params) {
          return dynamoClient.send(new UpdateCommand(params));
        },
      },
      s3Client: {
        async getObject(params) {
          const { GetObjectCommand } = await import('@aws-sdk/client-s3');
          const response = await s3Client.send(new GetObjectCommand(params));
          return (await response.Body?.transformToString()) ?? '';
        },
        async putObject(params) {
          return s3Client.send(new PutObjectCommand(params));
        },
      },
      mainTableName: process.env.MAIN_TABLE_NAME ?? '',
      artifactBucketName: process.env.ARTIFACT_BUCKET_NAME ?? '',
    });
  })();

  return productionHandlerPromise;
}

export async function handler(input: ExecuteStepInput): Promise<ExecuteStepOutput> {
  const runtimeHandler = await getProductionHandler();
  return runtimeHandler(input);
}
