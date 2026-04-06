import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { NextRequest, NextResponse } from 'next/server';

import type { Run, RunStep } from '../../../../packages/types/src/runs';
import { findRunRecordById } from '../../../../functions/shared/run-records.js';
import { maskSensitiveFields } from '../../../lib/mask-sensitive';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

const runsTable = process.env.MAIN_TABLE_NAME ?? process.env.RUNS_TABLE_NAME ?? 'CourseForgeRuns';
const runPayloadBucket =
  process.env.ARTIFACT_BUCKET_NAME ?? process.env.RUN_PAYLOAD_BUCKET ?? 'courseforge-run-payloads';

async function getS3Summary(outputRef: string): Promise<string> {
  const response = await s3.send(new GetObjectCommand({ Bucket: runPayloadBucket, Key: outputRef }));
  const raw = await response.Body?.transformToString();
  return (raw ?? '').slice(0, 500);
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

async function toStep(item: Record<string, unknown>): Promise<RunStep> {
  const step = item as Record<string, unknown> & { outputRef?: string };
  let outputSummary = step.outputSummary ?? step.output ?? null;

  if (typeof step.outputRef === 'string') {
    outputSummary = await getS3Summary(step.outputRef);
  }

  return {
    stepId: String(step.stepId),
    stepIndex: Number(step.stepIndex ?? 0),
    label: String(step.label ?? step.stepId ?? step.actionType ?? step.connectorKey ?? 'Step'),
    connectorKey: String(step.connectorKey ?? ''),
    status: String(step.status) as RunStep['status'],
    startedAt: String(step.startedAt ?? ''),
    endedAt: step.endedAt ? String(step.endedAt) : undefined,
    inputSummary: JSON.stringify(maskSensitiveFields(step.inputSummary ?? step.input ?? step.params ?? null), null, 2),
    outputSummary: JSON.stringify(maskSensitiveFields(outputSummary), null, 2),
    errorMessage:
      typeof (step.error as Record<string, unknown> | undefined)?.message === 'string'
        ? String((step.error as Record<string, unknown>).message)
        : undefined,
    errorCode:
      typeof (step.error as Record<string, unknown> | undefined)?.code === 'string'
        ? String((step.error as Record<string, unknown>).code)
        : undefined,
    rawResponse:
      (step.error as Record<string, unknown> | undefined)?.rawResponse !== undefined
        ? JSON.stringify(maskSensitiveFields((step.error as Record<string, unknown>).rawResponse), null, 2)
        : undefined,
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  const tenantId = request.headers.get('x-tenant-id') ?? 'CURRENT';

  const run = await findRunRecordById(
    {
      async query(params) {
        const result = await ddb.send(new QueryCommand(params));
        return { Items: result.Items as Array<Record<string, unknown>> | undefined };
      },
    },
    runsTable,
    tenantId,
    runId,
  );

  if (!run) {
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }

  const stepRes = await ddb.send(
    new QueryCommand({
      TableName: runsTable,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk': `RUN#${runId}`,
        ':prefix': 'STEP#',
      },
      ScanIndexForward: true,
    }),
  );

  const steps = await Promise.all((stepRes.Items ?? []).map((item) => toStep(item as Record<string, unknown>)));
  return NextResponse.json({
    run: toRun(run),
    steps,
  });
}
