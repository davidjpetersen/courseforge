import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';

import {
  schedulePK,
  scheduleSK,
  tenantPK,
  workflowMetaSK,
  workflowPK,
} from '../../src/models/schema';
import { WorkflowStatus } from '../../packages/types/src/index';
import { createScheduledTriggerHandler } from './handler';

// ── Helpers ──

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Arbitrary non-empty alphanumeric strings safe for DynamoDB keys (no special chars). */
const arbId = fc.stringOf(
  fc.mapToConstant({ num: 26, build: (n) => String.fromCharCode(97 + n) }),
  { minLength: 1, maxLength: 20 },
);

/** A deterministic UUID-v4-shaped string for the uuid dep. */
const FIXED_TRACE_ID = '11111111-1111-4111-a111-111111111111';
const FIXED_RUN_ID = '22222222-2222-4222-b222-222222222222';

function makeUuidSequence(): () => string {
  const values = [FIXED_TRACE_ID, FIXED_RUN_ID];
  let i = 0;
  return () => values[i++ % values.length] ?? FIXED_RUN_ID;
}

/**
 * Builds a handler and pre-configured mocks for a PUBLISHED-workflow happy path.
 */
function buildPublishedDeps(tenantId: string, workflowId: string) {
  const dynamoGet = vi.fn(async () => ({
    Item: {
      PK: workflowPK(workflowId),
      SK: workflowMetaSK(),
      tenantId,
      status: WorkflowStatus.PUBLISHED,
    },
  }));
  const dynamoPut = vi.fn(async () => ({}));
  const dynamoUpdate = vi.fn(async () => ({}));
  const putEvents = vi.fn(async () => ({}));

  const handler = createScheduledTriggerHandler({
    dynamoClient: { get: dynamoGet, put: dynamoPut, update: dynamoUpdate },
    eventBridgeClient: { putEvents },
    mainTableName: 'test-main-table',
    schedulesTableName: 'test-schedules-table',
    eventBusName: 'test-bus',
    clock: () => new Date('2026-04-06T00:00:00.000Z'),
    uuid: makeUuidSequence(),
    logger: { warn: vi.fn() },
  });

  return { handler, dynamoGet, dynamoPut, dynamoUpdate, putEvents };
}

// ── Property 4: Non-PUBLISHED workflow silent return ──
// Feature: event-triggering-routing, Property 4: Non-PUBLISHED workflow silent return

describe('Feature: event-triggering-routing, Property 4: Non-PUBLISHED workflow silent return', () => {
  /**
   * For any scheduler event targeting a workflow whose status is not PUBLISHED
   * (DRAFT, PAUSED, ARCHIVED) or not found, the handler returns without error
   * and without publishing any DomainEvent or writing any Run_Record.
   */
  it('returns without side-effects for non-PUBLISHED or missing workflows', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbId,
        arbId,
        arbId,
        fc.oneof(
          fc.constantFrom('DRAFT', 'PAUSED', 'ARCHIVED'),
          fc.constant(null), // null signals "item not found"
        ),
        async (tenantId, workflowId, scheduleId, statusOrMissing) => {
          const putEvents = vi.fn(async () => ({}));
          const dynamoPut = vi.fn(async () => ({}));
          const dynamoUpdate = vi.fn(async () => ({}));
          const warnSpy = vi.fn();

          const dynamoGet = vi.fn(async () => {
            if (statusOrMissing === null) {
              // Simulate item not found
              return { Item: undefined };
            }
            return {
              Item: {
                PK: workflowPK(workflowId),
                SK: workflowMetaSK(),
                tenantId,
                status: statusOrMissing,
              },
            };
          });

          const handler = createScheduledTriggerHandler({
            dynamoClient: { get: dynamoGet, put: dynamoPut, update: dynamoUpdate },
            eventBridgeClient: { putEvents },
            mainTableName: 'test-main-table',
            schedulesTableName: 'test-schedules-table',
            eventBusName: 'test-bus',
            logger: { warn: warnSpy },
          });

          const event = { workflowId, tenantId, scheduleId };

          // Handler must not throw
          await expect(handler(event)).resolves.toBeUndefined();

          // No EventBridge event published
          expect(putEvents).not.toHaveBeenCalled();

          // No run record written
          expect(dynamoPut).not.toHaveBeenCalled();

          // No schedule update written
          expect(dynamoUpdate).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('also returns without side-effects when tenantId mismatches', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbId,
        arbId,
        arbId,
        arbId,
        async (tenantId, differentTenantId, workflowId, scheduleId) => {
          // Ensure the IDs actually differ so the mismatch branch is hit
          fc.pre(tenantId !== differentTenantId);

          const putEvents = vi.fn(async () => ({}));
          const dynamoPut = vi.fn(async () => ({}));
          const dynamoUpdate = vi.fn(async () => ({}));

          // Workflow exists and is PUBLISHED, but belongs to a different tenant
          const dynamoGet = vi.fn(async () => ({
            Item: {
              PK: workflowPK(workflowId),
              SK: workflowMetaSK(),
              tenantId: differentTenantId,
              status: WorkflowStatus.PUBLISHED,
            },
          }));

          const handler = createScheduledTriggerHandler({
            dynamoClient: { get: dynamoGet, put: dynamoPut, update: dynamoUpdate },
            eventBridgeClient: { putEvents },
            mainTableName: 'test-main-table',
            schedulesTableName: 'test-schedules-table',
            eventBusName: 'test-bus',
            logger: { warn: vi.fn() },
          });

          await expect(handler({ workflowId, tenantId, scheduleId })).resolves.toBeUndefined();

          expect(putEvents).not.toHaveBeenCalled();
          expect(dynamoPut).not.toHaveBeenCalled();
          expect(dynamoUpdate).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 5: Successful scheduled trigger produces complete outputs ──
// Feature: event-triggering-routing, Property 5: Successful scheduled trigger produces complete outputs

describe('Feature: event-triggering-routing, Property 5: Successful scheduled trigger produces complete outputs', () => {
  /**
   * For any valid scheduler event targeting a PUBLISHED workflow:
   * - publishes DomainEvent with source `courseforge.trigger` and detail-type `ScheduleTriggered`
   * - writes Run_Record with `triggerType` set to `scheduled`
   * - updates schedule record's `lastRunAt` field in the schedules table
   */
  it('publishes event, writes run record with triggerType=scheduled, updates schedule lastRunAt', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbId,
        arbId,
        arbId,
        async (tenantId, workflowId, scheduleId) => {
          const { handler, putEvents, dynamoPut, dynamoUpdate } = buildPublishedDeps(
            tenantId,
            workflowId,
          );

          const event = { workflowId, tenantId, scheduleId };
          await handler(event);

          // Exactly one EventBridge call with correct source and detail-type
          expect(putEvents).toHaveBeenCalledTimes(1);
          const ebCall = putEvents.mock.calls[0]?.[0] as {
            Entries: Array<{ Source: string; DetailType: string; EventBusName: string }>;
          };
          expect(ebCall.Entries).toHaveLength(1);
          expect(ebCall.Entries[0]?.Source).toBe('courseforge.trigger');
          expect(ebCall.Entries[0]?.DetailType).toBe('ScheduleTriggered');
          expect(ebCall.Entries[0]?.EventBusName).toBe('test-bus');

          // Exactly one DynamoDB put — the run record
          expect(dynamoPut).toHaveBeenCalledTimes(1);
          const putCall = dynamoPut.mock.calls[0]?.[0] as {
            TableName: string;
            Item: Record<string, unknown>;
          };
          expect(putCall.TableName).toBe('test-main-table');
          expect(putCall.Item.PK).toBe(tenantPK(tenantId));
          expect(typeof putCall.Item.SK).toBe('string');
          expect((putCall.Item.SK as string).startsWith('RUN#')).toBe(true);
          expect(putCall.Item.triggerType).toBe('scheduled');
          expect(putCall.Item.tenantId).toBe(tenantId);
          expect(putCall.Item.workflowId).toBe(workflowId);
          expect(putCall.Item.scheduleId).toBe(scheduleId);

          // Exactly one DynamoDB update — the schedule's lastRunAt
          expect(dynamoUpdate).toHaveBeenCalledTimes(1);
          const updateCall = dynamoUpdate.mock.calls[0]?.[0] as {
            TableName: string;
            Key: Record<string, unknown>;
            UpdateExpression: string;
            ExpressionAttributeValues?: Record<string, unknown>;
          };
          expect(updateCall.TableName).toBe('test-schedules-table');
          expect(updateCall.Key.PK).toBe(schedulePK(workflowId));
          expect(updateCall.Key.SK).toBe(scheduleSK(scheduleId));
          expect(updateCall.UpdateExpression).toContain('lastRunAt');
          expect(updateCall.ExpressionAttributeValues).toHaveProperty(':lastRunAt');
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 14: DomainEvent structure conformance (scheduled path) ──
// Feature: event-triggering-routing, Property 14: DomainEvent structure conformance

describe('Feature: event-triggering-routing, Property 14: DomainEvent structure conformance', () => {
  /**
   * For any valid scheduler event targeting a PUBLISHED workflow, the published
   * DomainEvent contains all required fields:
   *   tenantId, workflowId, eventType, payload, traceId, timestamp
   * where timestamp is valid ISO 8601 and traceId is valid UUID v4.
   */
  it('published DomainEvent has all required fields with correct formats', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbId,
        arbId,
        arbId,
        async (tenantId, workflowId, scheduleId) => {
          const { handler, putEvents } = buildPublishedDeps(tenantId, workflowId);

          const event = { workflowId, tenantId, scheduleId };
          await handler(event);

          expect(putEvents).toHaveBeenCalledTimes(1);
          const ebCall = putEvents.mock.calls[0]?.[0] as {
            Entries: Array<{ Detail: string }>;
          };
          const detail = JSON.parse(ebCall.Entries[0]?.Detail ?? '{}') as Record<string, unknown>;

          // All required fields must be present
          expect(detail).toHaveProperty('tenantId', tenantId);
          expect(detail).toHaveProperty('workflowId', workflowId);
          expect(detail).toHaveProperty('eventType', 'ScheduleTriggered');
          expect(detail).toHaveProperty('payload');
          expect(detail).toHaveProperty('traceId');
          expect(detail).toHaveProperty('timestamp');

          // traceId must be a valid UUID v4
          expect(UUID_V4_RE.test(detail.traceId as string)).toBe(true);

          // timestamp must be valid ISO 8601 (parseable and ending in 'Z')
          const ts = new Date(detail.timestamp as string);
          expect(Number.isNaN(ts.getTime())).toBe(false);
          expect((detail.timestamp as string).endsWith('Z')).toBe(true);

          // payload must include the scheduleId
          expect((detail.payload as Record<string, unknown>).scheduleId).toBe(scheduleId);
        },
      ),
      { numRuns: 100 },
    );
  });
});
