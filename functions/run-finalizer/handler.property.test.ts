import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';

import { createRunFinalizerHandler } from './handler.js';

const arbStatus = fc.constantFrom<'SUCCESS' | 'FAILED'>('SUCCESS', 'FAILED');
const arbJsonSafe = fc.jsonValue().map((value) => JSON.parse(JSON.stringify(value)));

describe('RunFinalizer properties', () => {
  it('publishes a domain event that round-trips through JSON serialization', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        arbStatus,
        arbJsonSafe,
        async (tenantId, workflowId, runId, status, extraPayload) => {
          const putEvents = vi.fn(async () => ({}));
          const handler = createRunFinalizerHandler({
            dynamoClient: {
              query: vi.fn(async () => ({
                Items: [
                  {
                    PK: `TENANT#${tenantId}`,
                    SK: `RUN#2026-04-06T22:00:00.000Z#${runId}`,
                    startedAt: '2026-04-06T22:00:00.000Z',
                  },
                ],
              })),
              update: vi.fn(async () => ({})),
              put: vi.fn(async () => ({})),
            },
            eventBridgeClient: { putEvents },
            mainTableName: 'courseforge-main',
            eventBusName: 'courseforge-domain',
            clock: () => new Date('2026-04-06T22:00:05.000Z'),
          });

          await handler({
            runId,
            tenantId,
            workflowId,
            status,
            stepResults: [{ extraPayload }],
            error:
              status === 'FAILED'
                ? {
                    failedStepId: 'step-1',
                    errorMessage: 'boom',
                    errorCode: 'ConnectorError',
                  }
                : undefined,
          });

          const payload = (putEvents.mock.calls[0]?.[0] as {
            Entries: Array<{ Detail: string }>;
          }).Entries[0]?.Detail;
          const parsed = JSON.parse(payload);
          const roundTripped = JSON.parse(JSON.stringify(parsed));
          expect(roundTripped).toEqual(parsed);
        },
      ),
      { numRuns: 50 },
    );
  });
});
