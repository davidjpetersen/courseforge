import type { Run, RunStep } from '../../../packages/types/src/runs.js';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from '../triggers/shared.js';
import { jsonResponse, resolveTenantId } from '../triggers/shared.js';
import { maskSensitiveFields } from '../../../app/lib/mask-sensitive.js';
import type { RunRepository } from './handler.js';

export interface S3Client {
  getObjectTruncated(bucket: string, key: string, maxBytes: number): Promise<string>;
}

export interface RunDetailResponse {
  run: Run;
  steps: RunStep[];
}

const S3_TRUNCATION_LIMIT = 500;

function maskSummary(summary: string): string {
  try {
    const parsed = JSON.parse(summary);
    return JSON.stringify(maskSensitiveFields(parsed));
  } catch {
    return summary;
  }
}

export function createRunDetailHandler(repo: RunRepository, s3: S3Client, bucket: string) {
  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const tenantId = resolveTenantId(event);
    if (tenantId === null) {
      return jsonResponse(400, { message: 'Missing x-tenant-id header' });
    }

    const runId = event.pathParameters?.runId;
    if (!runId) {
      return jsonResponse(400, { message: 'Missing runId path parameter' });
    }

    const run = await repo.getById(tenantId, runId);
    if (!run || run.tenantId !== tenantId) {
      return jsonResponse(404, { message: 'Run not found' });
    }

    const steps = await repo.getSteps(runId);

    const enrichedSteps = await Promise.all(
      steps.map(async (step) => {
        let { outputSummary } = step;

        const outputRef = (step as RunStep & { outputRef?: string }).outputRef;
        if (typeof outputRef === 'string') {
          outputSummary = await s3.getObjectTruncated(bucket, outputRef, S3_TRUNCATION_LIMIT);
        }

        return {
          ...step,
          inputSummary: maskSummary(step.inputSummary),
          outputSummary: maskSummary(outputSummary),
        };
      }),
    );

    enrichedSteps.sort((a, b) => a.stepIndex - b.stepIndex);

    const response: RunDetailResponse = { run, steps: enrichedSteps };
    return jsonResponse(200, response);
  };
}
