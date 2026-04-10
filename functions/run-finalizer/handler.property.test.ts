import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';

import { createRunFinalizerHandler } from './handler';

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

  /**
   * **Validates: Requirements 4.1**
   * Property 5: Run finalization persists correct status and timing
   *
   * For any run finalization input with status SUCCESS or FAILED, the updated
   * Run_Record should have `status` matching the input, `endedAt` set to a valid
   * ISO 8601 timestamp, and `durationMs` >= 0 equal to endedAt - startedAt.
   */
  it('persists correct status and timing in Run_Record update', async () => {
    const arbStartOffset = fc.integer({ min: 0, max: 60_000 });

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        arbStatus,
        arbStartOffset,
        async (tenantId, workflowId, runId, status, startOffsetMs) => {
          const baseTime = new Date('2026-01-01T00:00:00.000Z').getTime();
          const startedAt = new Date(baseTime).toISOString();
          const endedAtDate = new Date(baseTime + startOffsetMs);

          const updateMock = vi.fn(async () => ({}));
          const handler = createRunFinalizerHandler({
            dynamoClient: {
              query: vi.fn(async () => ({
                Items: [
                  {
                    PK: `TENANT#${tenantId}`,
                    SK: `RUN#${startedAt}#${runId}`,
                    startedAt,
                  },
                ],
              })),
              update: updateMock,
              put: vi.fn(async () => ({})),
            },
            eventBridgeClient: { putEvents: vi.fn(async () => ({})) },
            mainTableName: 'courseforge-main',
            eventBusName: 'courseforge-domain',
            clock: () => endedAtDate,
          });

          await handler({
            runId,
            tenantId,
            workflowId,
            status,
            error:
              status === 'FAILED'
                ? { failedStepId: 's1', errorMessage: 'err', errorCode: 'E1' }
                : undefined,
          });

          expect(updateMock).toHaveBeenCalledTimes(1);
          const updateCall = updateMock.mock.calls[0]?.[0] as {
            ExpressionAttributeValues: Record<string, unknown>;
          };
          const vals = updateCall.ExpressionAttributeValues;

          // status matches input
          expect(vals[':status']).toBe(status);

          // endedAt is a valid ISO 8601 timestamp
          const endedAtVal = vals[':endedAt'] as string;
          expect(Number.isNaN(Date.parse(endedAtVal))).toBe(false);
          expect(endedAtVal).toBe(endedAtDate.toISOString());

          // durationMs = endedAt - startedAt >= 0
          const durationMs = vals[':durationMs'] as number;
          const expectedDuration = endedAtDate.getTime() - new Date(startedAt).getTime();
          expect(durationMs).toBe(expectedDuration);
          expect(durationMs).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 4.3**
   * Property 6: Audit entry actionType matches run status
   *
   * For any status value (SUCCESS/FAILED), the written Audit_Entry actionType
   * should be RUN_COMPLETED when status is SUCCESS and RUN_FAILED when status is FAILED.
   */
  it('writes audit entry with actionType matching run status', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        arbStatus,
        async (tenantId, workflowId, runId, status) => {
          const putMock = vi.fn(async () => ({}));
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
              put: putMock,
            },
            eventBridgeClient: { putEvents: vi.fn(async () => ({})) },
            mainTableName: 'courseforge-main',
            eventBusName: 'courseforge-domain',
            clock: () => new Date('2026-04-06T22:00:05.000Z'),
          });

          await handler({
            runId,
            tenantId,
            workflowId,
            status,
            error:
              status === 'FAILED'
                ? { failedStepId: 's1', errorMessage: 'err', errorCode: 'E1' }
                : undefined,
          });

          expect(putMock).toHaveBeenCalledTimes(1);
          const putCall = putMock.mock.calls[0]?.[0] as {
            Item: Record<string, unknown>;
          };
          const auditEntry = putCall.Item;

          const expectedActionType =
            status === 'SUCCESS' ? 'RUN_COMPLETED' : 'RUN_FAILED';
          expect(auditEntry.actionType).toBe(expectedActionType);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 4.4, 10.1, 10.3**
   * Property 7: Domain event structure and status mapping
   *
   * For any finalization input, the published event has all required fields
   * (tenantId, workflowId, runId, status, durationMs), source is `courseforge.run`,
   * and detail-type is `RunCompleted` for SUCCESS or `RunFailed` for FAILED.
   */
  it('publishes domain event with correct structure and status mapping', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        arbStatus,
        async (tenantId, workflowId, runId, status) => {
          const putEventsMock = vi.fn(async () => ({}));
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
            eventBridgeClient: { putEvents: putEventsMock },
            mainTableName: 'courseforge-main',
            eventBusName: 'courseforge-domain',
            clock: () => new Date('2026-04-06T22:00:05.000Z'),
          });

          await handler({
            runId,
            tenantId,
            workflowId,
            status,
            error:
              status === 'FAILED'
                ? { failedStepId: 's1', errorMessage: 'err', errorCode: 'E1' }
                : undefined,
          });

          expect(putEventsMock).toHaveBeenCalledTimes(1);
          const ebCall = putEventsMock.mock.calls[0]?.[0] as {
            Entries: Array<{
              Source: string;
              DetailType: string;
              EventBusName: string;
              Detail: string;
            }>;
          };

          expect(ebCall.Entries).toHaveLength(1);
          const entry = ebCall.Entries[0]!;

          // source is courseforge.run
          expect(entry.Source).toBe('courseforge.run');

          // detail-type maps correctly
          const expectedDetailType =
            status === 'SUCCESS' ? 'RunCompleted' : 'RunFailed';
          expect(entry.DetailType).toBe(expectedDetailType);

          // detail contains all required fields
          const detail = JSON.parse(entry.Detail) as Record<string, unknown>;
          expect(detail.tenantId).toBe(tenantId);
          expect(detail.workflowId).toBe(workflowId);
          expect(detail.runId).toBe(runId);
          expect(detail.status).toBe(status);
          expect(typeof detail.durationMs).toBe('number');
          expect(detail.durationMs as number).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
