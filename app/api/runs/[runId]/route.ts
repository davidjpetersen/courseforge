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

async function getS3Summary(outputRef: string): Promise<string> {
  const response = await s3.send(new GetObjectCommand({ Bucket: runPayloadBucket, Key: outputRef }));
  const raw = await response.Body?.transformToString();
  return (raw ?? '').slice(0, 500);
}

function toRun(item: Record<string, unknown>): Run {
  return item as unknown as Run;
}

async function toStep(item: Record<string, unknown>): Promise<RunStep> {
  const step = item as unknown as RunStep & { outputRef?: string };
  if (step.outputRef) {
    step.outputSummary = await getS3Summary(step.outputRef);
  }

  return {
    ...step,
    inputSummary: JSON.stringify(maskSensitiveFields(step.inputSummary), null, 2),
    outputSummary: JSON.stringify(maskSensitiveFields(step.outputSummary), null, 2),
  };
}

export async function GET(
  _: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;

  const runRes = await ddb.send(
    new GetCommand({
      TableName: runsTable,
      Key: { PK: `RUN#${runId}`, SK: 'META' },
    }),
  );

  const run = runRes.Item as Record<string, unknown> | undefined;
  if (!run || run.tenantId !== 'TENANT#CURRENT') {
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
