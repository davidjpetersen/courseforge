import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';

import { runtimeConnectorRegistry } from '../shared/connectors.js';
import { createExecuteStepHandler } from './handler.js';

const arbJsonSafe = fc.jsonValue().map((value) => JSON.parse(JSON.stringify(value)));

describe('ExecuteStep handler properties', () => {
  it('resolves known connector keys and rejects unknown ones', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (connectorKey) => {
        const handler = createExecuteStepHandler({
          dynamoClient: {
            put: vi.fn(async () => ({})),
            update: vi.fn(async () => ({})),
          },
          s3Client: { putObject: vi.fn(async () => ({ })) },
          mainTableName: 'courseforge-main',
          artifactBucketName: 'artifacts',
          connectors: runtimeConnectorRegistry,
        });

        const input = {
          runId: 'run-1',
          tenantId: 'tenant-1',
          traceId: 'trace-1',
          accumulatedContext: {},
          step: {
            stepId: 'step-1',
            stepIndex: 0,
            connectorKey,
            actionType: 'test',
            params: { ok: true },
            retryPolicy: { maxAttempts: 1, backoffRate: 1 },
          },
        };

        const isKnown = runtimeConnectorRegistry.has(connectorKey);
        if (isKnown) {
          await expect(handler(input)).resolves.toBeDefined();
        } else {
          await expect(handler(input)).rejects.toThrow(/Unknown connector/);
        }
      }),
      { numRuns: 50 },
    );
  });

  it('offloads outputs iff their serialized size exceeds 4KB', async () => {
    await fc.assert(
      fc.asyncProperty(arbJsonSafe, async (output) => {
        const putObject = vi.fn(async () => ({}));
        const update = vi.fn(async () => ({}));

        const handler = createExecuteStepHandler({
          dynamoClient: {
            put: vi.fn(async () => ({})),
            update,
          },
          s3Client: { putObject },
          mainTableName: 'courseforge-main',
          artifactBucketName: 'artifacts',
          connectors: new Map([['echo', { run: async () => output }]]),
        });

        await handler({
          runId: 'run-1',
          tenantId: 'tenant-1',
          traceId: 'trace-1',
          accumulatedContext: {},
          step: {
            stepId: 'step-1',
            stepIndex: 0,
            connectorKey: 'echo',
            actionType: 'echo',
            params: {},
            retryPolicy: { maxAttempts: 1, backoffRate: 1 },
          },
        });

        const size = Buffer.byteLength(JSON.stringify(output), 'utf8');
        const updateCall = update.mock.calls[0]?.[0] as {
          ExpressionAttributeValues: Record<string, unknown>;
        };

        if (size > 4 * 1024) {
          expect(putObject).toHaveBeenCalledOnce();
          expect(updateCall.ExpressionAttributeValues[':outputRef']).toBe(
            'runs/run-1/steps/step-1/output.json',
          );
        } else {
          expect(putObject).not.toHaveBeenCalled();
          expect(updateCall.ExpressionAttributeValues[':output']).toEqual(output);
        }
      }),
      { numRuns: 50 },
    );
  });

  it('preserves existing context keys when adding the current step result', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.dictionary(fc.string({ minLength: 1 }), arbJsonSafe),
        arbJsonSafe,
        async (context, stepResult) => {
          const handler = createExecuteStepHandler({
            dynamoClient: {
              put: vi.fn(async () => ({})),
              update: vi.fn(async () => ({})),
            },
            s3Client: { putObject: vi.fn(async () => ({ })) },
            mainTableName: 'courseforge-main',
            artifactBucketName: 'artifacts',
            connectors: new Map([['echo', { run: async () => stepResult }]]),
          });

          const result = await handler({
            runId: 'run-1',
            tenantId: 'tenant-1',
            traceId: 'trace-1',
            accumulatedContext: context,
            step: {
              stepId: 'step-current',
              stepIndex: 0,
              connectorKey: 'echo',
              actionType: 'echo',
              params: {},
              retryPolicy: { maxAttempts: 1, backoffRate: 1 },
            },
          });

          for (const [key, value] of Object.entries(context)) {
            expect(result.accumulatedContext[key]).toEqual(value);
          }
          expect(result.accumulatedContext['step-current']).toEqual(stepResult);
        },
      ),
      { numRuns: 50 },
    );
  });
});
