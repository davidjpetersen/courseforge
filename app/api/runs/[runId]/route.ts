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
  const step = item as Record<string, unknown> & { outputRef?: string };
  let outputSummary = step.outputSummary ?? step.output ?? null;
  const error = typeof step.error === 'object' && step.error !== null
    ? (step.error as Record<string, unknown>)
    : undefined;

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
    inputSummary: maskSummary(step.inputSummary ?? step.input ?? step.params ?? null),
    outputSummary: maskSummary(outputSummary),
    errorMessage:
      typeof step.errorMessage === 'string'
        ? step.errorMessage
        : typeof error?.message === 'string'
          ? String(error.message)
        : undefined,
    errorCode:
      typeof step.errorCode === 'string'
        ? step.errorCode
        : typeof error?.code === 'string'
          ? String(error.code)
        : undefined,
    rawResponse:
      typeof step.rawResponse === 'string'
        ? step.rawResponse
        : error?.rawResponse !== undefined
          ? maskSummary(error.rawResponse)
        : undefined,
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  const tenantId = getTenantId(request);

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
        const steps = await Promise.all(
          (stepRes.Items ?? [])
            .map((item) => item as Record<string, unknown>)
            .sort((a, b) => Number(a.stepIndex ?? 0) - Number(b.stepIndex ?? 0))
            .map((item) => toStep(item)),
        );
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
