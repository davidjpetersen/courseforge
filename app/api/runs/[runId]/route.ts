import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { NextRequest, NextResponse } from 'next/server';

import type { Run, RunStep } from '../../../../packages/types/src/runs';
import { maskSensitiveFields } from '../../../lib/mask-sensitive';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});

const runsTable = process.env.RUNS_TABLE_NAME ?? 'CourseForgeRuns';
const runPayloadBucket = process.env.RUN_PAYLOAD_BUCKET ?? 'courseforge-run-payloads';

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

async function getS3Summary(outputRef: string): Promise<string> {
  const response = await s3.send(new GetObjectCommand({ Bucket: runPayloadBucket, Key: outputRef }));
  const raw = await response.Body?.transformToString();
  return (raw ?? '').slice(0, 500);
}

function toRun(item: Record<string, unknown>): Run {
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
    endedAt: typeof item.endedAt === 'string' ? item.endedAt : undefined,
    durationMs: typeof item.durationMs === 'number' ? item.durationMs : undefined,
    parentRunId: typeof item.parentRunId === 'string' ? item.parentRunId : undefined,
    failedStepId: typeof item.failedStepId === 'string' ? item.failedStepId : undefined,
  };
}

function maskSummary(summary: unknown): string {
  if (typeof summary !== 'string') {
    return JSON.stringify(maskSensitiveFields(summary), null, 2);
  }

  try {
    return JSON.stringify(maskSensitiveFields(JSON.parse(summary)), null, 2);
  } catch {
    return summary;
  }
}

async function toStep(item: Record<string, unknown>): Promise<RunStep> {
  const step = item as unknown as RunStep & { outputRef?: string };
  if (step.outputRef) {
    step.outputSummary = await getS3Summary(step.outputRef);
  }

  return {
    stepId: String(step.stepId),
    stepIndex: Number(step.stepIndex),
    label: String(step.label),
    connectorKey: String(step.connectorKey),
    status: step.status,
    startedAt: String(step.startedAt),
    endedAt: typeof step.endedAt === 'string' ? step.endedAt : undefined,
    inputSummary: maskSummary(step.inputSummary),
    outputSummary: maskSummary(step.outputSummary),
    errorMessage: typeof step.errorMessage === 'string' ? step.errorMessage : undefined,
    errorCode: typeof step.errorCode === 'string' ? step.errorCode : undefined,
    rawResponse: typeof step.rawResponse === 'string' ? step.rawResponse : undefined,
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  const tenantId = getTenantId(request);

  const runRes = await ddb.send(
    new GetCommand({
      TableName: runsTable,
      Key: { PK: `RUN#${runId}`, SK: 'META' },
    }),
  );

  const run = runRes.Item as Record<string, unknown> | undefined;
  if (!run || normalizeTenantId(String(run.tenantId ?? '')) !== tenantId) {
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

  const steps = await Promise.all(
    (stepRes.Items ?? [])
      .map((item) => item as Record<string, unknown>)
      .sort((a, b) => Number(a.stepIndex ?? 0) - Number(b.stepIndex ?? 0))
      .map((item) => toStep(item)),
  );

  return NextResponse.json({
    run: toRun(run),
    steps,
  });
}
