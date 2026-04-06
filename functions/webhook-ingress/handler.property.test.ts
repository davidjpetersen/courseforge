import { createHash } from 'node:crypto';

import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';

import { tenantPK, runSK, webhookSecretSK, workflowMetaSK, workflowPK } from '../../src/models/schema.js';
import { WorkflowStatus } from '../../packages/types/src/index.js';
import { createWebhookIngressHandler } from './handler.js';

// ── Helpers ──

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Arbitrary non-empty strings that won't contain ':' so they are safe as tenantId fragments. */
const arbId = fc
  .stringOf(fc.mapToConstant({ num: 26, build: (n) => String.fromCharCode(97 + n) }), {
    minLength: 1,
    maxLength: 20,
  });

/** Arbitrary token: any non-empty string without ':' (so it doesn't split the Bearer value). */
const arbToken = fc
  .stringOf(fc.mapToConstant({ num: 26, build: (n) => String.fromCharCode(97 + n) }), {
    minLength: 1,
    maxLength: 40,
  });

/** JSON-safe payload that survives a round-trip (avoids -0). */
const arbJsonSafe = fc.jsonValue().map((v) => JSON.parse(JSON.stringify(v)));

/** A deterministic UUID-v4-shaped string for the uuid dep. */
const FIXED_TRACE_ID = '11111111-1111-4111-a111-111111111111';
const FIXED_RUN_ID = '22222222-2222-4222-b222-222222222222';

function makeUuidSequence(): () => string {
  const values = [FIXED_TRACE_ID, FIXED_RUN_ID];
  let i = 0;
  return () => values[i++ % values.length] ?? FIXED_RUN_ID;
}

/**
 * Builds a fully-wired handler and pre-configured dynamo/eventbridge mocks for a
 * PUBLISHED-workflow happy path, with the secret tokenHash set to sha256(token).
 */
function buildSuccessfulDeps(
  tenantId: string,
  workflowId: string,
  token: string,
  payload: unknown,
) {
  const dynamoGet = vi.fn(async (params: { TableName: string; Key: Record<string, unknown> }) => {
    const sk = params.Key.SK as string;
    if (sk === webhookSecretSK(workflowId)) {
      return { Item: { tokenHash: sha256(token) } };
    }
    // workflow meta lookup
    return {
      Item: {
        PK: workflowPK(workflowId),
        SK: workflowMetaSK(),
        tenantId,
        status: WorkflowStatus.PUBLISHED,
      },
    };
  });

  const dynamoPut = vi.fn(async () => ({}));
  const putEvents = vi.fn(async () => ({}));

  const handler = createWebhookIngressHandler({
    dynamoClient: { get: dynamoGet, put: dynamoPut },
    eventBridgeClient: { putEvents },
    mainTableName: 'test-table',
    eventBusName: 'test-bus',
    clock: () => new Date('2026-04-06T00:00:00.000Z'),
    uuid: makeUuidSequence(),
  });

  const event = {
    pathParameters: { workflowId },
    headers: { Authorization: `Bearer ${tenantId}:${token}` },
    body: JSON.stringify(payload),
  };

  return { handler, event, dynamoGet, dynamoPut, putEvents };
}

// ── Property 1: Webhook authentication correctness ──
// Feature: event-triggering-routing, Property 1: Webhook authentication correctness

describe('Feature: event-triggering-routing, Property 1: Webhook authentication correctness', () => {
  /**
   * For any bearer token and stored SHA-256 hash:
   * - the handler returns 202 when SHA-256(token) matches the stored hash
   * - the handler returns 401 when the hash does not match
   */
  it('returns 202 iff sha256(token) equals the stored tokenHash, else 401', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbId,          // tenantId
        arbId,          // workflowId
        arbToken,       // actual token sent in the header
        arbToken,       // token whose hash is stored in dynamo (may differ)
        async (tenantId, workflowId, sentToken, storedToken) => {
          const storedHash = sha256(storedToken);
          const dynamoGet = vi.fn(async (params: { TableName: string; Key: Record<string, unknown> }) => {
            const sk = params.Key.SK as string;
            if (sk === webhookSecretSK(workflowId)) {
              return { Item: { tokenHash: storedHash } };
            }
            return {
              Item: {
                PK: workflowPK(workflowId),
                SK: workflowMetaSK(),
                tenantId,
                status: WorkflowStatus.PUBLISHED,
              },
            };
          });

          const handler = createWebhookIngressHandler({
            dynamoClient: { get: dynamoGet, put: vi.fn(async () => ({})) },
            eventBridgeClient: { putEvents: vi.fn(async () => ({})) },
            mainTableName: 'test-table',
            eventBusName: 'test-bus',
            clock: () => new Date('2026-04-06T00:00:00.000Z'),
            uuid: makeUuidSequence(),
          });

          const response = await handler({
            pathParameters: { workflowId },
            headers: { Authorization: `Bearer ${tenantId}:${sentToken}` },
            body: JSON.stringify({ x: 1 }),
          });

          const tokensMatch = sentToken === storedToken;
          if (tokensMatch) {
            expect(response.statusCode).toBe(202);
          } else {
            expect(response.statusCode).toBe(401);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 2: Non-PUBLISHED workflow rejection (webhook) ──
// Feature: event-triggering-routing, Property 2: Non-PUBLISHED workflow rejection (webhook)

describe('Feature: event-triggering-routing, Property 2: Non-PUBLISHED workflow rejection (webhook)', () => {
  /**
   * For any non-PUBLISHED workflow status (DRAFT, PAUSED, ARCHIVED):
   * authenticated requests return 409 without publishing any event or writing
   * any run record.
   */
  it('returns 409 for non-PUBLISHED statuses without side-effects', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbId,
        arbId,
        arbToken,
        fc.constantFrom('DRAFT', 'PAUSED', 'ARCHIVED'),
        async (tenantId, workflowId, token, nonPublishedStatus) => {
          const putEvents = vi.fn(async () => ({}));
          const dynamoPut = vi.fn(async () => ({}));

          const dynamoGet = vi.fn(async (params: { TableName: string; Key: Record<string, unknown> }) => {
            const sk = params.Key.SK as string;
            if (sk === webhookSecretSK(workflowId)) {
              return { Item: { tokenHash: sha256(token) } };
            }
            return {
              Item: {
                PK: workflowPK(workflowId),
                SK: workflowMetaSK(),
                tenantId,
                status: nonPublishedStatus,
              },
            };
          });

          const handler = createWebhookIngressHandler({
            dynamoClient: { get: dynamoGet, put: dynamoPut },
            eventBridgeClient: { putEvents },
            mainTableName: 'test-table',
            eventBusName: 'test-bus',
          });

          const response = await handler({
            pathParameters: { workflowId },
            headers: { Authorization: `Bearer ${tenantId}:${token}` },
            body: JSON.stringify({ x: 1 }),
          });

          expect(response.statusCode).toBe(409);
          // No events published, no run written
          expect(putEvents).not.toHaveBeenCalled();
          expect(dynamoPut).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 3: Successful webhook processing produces complete outputs ──
// Feature: event-triggering-routing, Property 3: Successful webhook processing produces complete outputs

describe('Feature: event-triggering-routing, Property 3: Successful webhook processing produces complete outputs', () => {
  /**
   * For any valid authenticated request to a PUBLISHED workflow with valid JSON body:
   * - publishes exactly one DomainEvent with source `courseforge.trigger` and
   *   detail-type `WebhookReceived`
   * - writes exactly one Run record whose key matches tenantPK / runSK patterns
   * - returns 202 with runId and traceId that are valid UUID v4 strings
   */
  it('publishes event, writes run record, returns 202 with valid UUID ids', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbId,
        arbId,
        arbToken,
        arbJsonSafe,
        async (tenantId, workflowId, token, payload) => {
          const { handler, event, putEvents, dynamoPut } = buildSuccessfulDeps(
            tenantId,
            workflowId,
            token,
            payload,
          );

          const response = await handler(event);

          expect(response.statusCode).toBe(202);

          const body = JSON.parse(response.body) as { runId: string; traceId: string };
          expect(UUID_V4_RE.test(body.runId)).toBe(true);
          expect(UUID_V4_RE.test(body.traceId)).toBe(true);

          // Exactly one EventBridge call with the right source and detail-type
          expect(putEvents).toHaveBeenCalledTimes(1);
          const ebCall = putEvents.mock.calls[0]?.[0] as {
            Entries: Array<{ Source: string; DetailType: string }>;
          };
          expect(ebCall.Entries).toHaveLength(1);
          expect(ebCall.Entries[0]?.Source).toBe('courseforge.trigger');
          expect(ebCall.Entries[0]?.DetailType).toBe('WebhookReceived');

          // Exactly one DynamoDB put — the run record
          expect(dynamoPut).toHaveBeenCalledTimes(1);
          const putCall = dynamoPut.mock.calls[0]?.[0] as {
            Item: Record<string, unknown>;
          };
          expect(putCall.Item.PK).toBe(tenantPK(tenantId));
          // SK starts with 'RUN#'
          expect(typeof putCall.Item.SK).toBe('string');
          expect((putCall.Item.SK as string).startsWith('RUN#')).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 14: DomainEvent structure conformance (webhook path) ──
// Feature: event-triggering-routing, Property 14: DomainEvent structure conformance

describe('Feature: event-triggering-routing, Property 14: DomainEvent structure conformance', () => {
  /**
   * For any valid authenticated request to a PUBLISHED workflow, the published
   * DomainEvent contains all required fields:
   *   tenantId, workflowId, eventType, payload, traceId, timestamp
   * where timestamp is valid ISO 8601 and traceId is valid UUID v4.
   */
  it('published DomainEvent has all required fields with correct formats', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbId,
        arbId,
        arbToken,
        arbJsonSafe,
        async (tenantId, workflowId, token, payload) => {
          const { handler, event, putEvents } = buildSuccessfulDeps(
            tenantId,
            workflowId,
            token,
            payload,
          );

          const response = await handler(event);
          expect(response.statusCode).toBe(202);

          expect(putEvents).toHaveBeenCalledTimes(1);
          const ebCall = putEvents.mock.calls[0]?.[0] as {
            Entries: Array<{ Detail: string }>;
          };
          const detail = JSON.parse(ebCall.Entries[0]?.Detail ?? '{}') as Record<string, unknown>;

          // Required fields present
          expect(detail).toHaveProperty('tenantId', tenantId);
          expect(detail).toHaveProperty('workflowId', workflowId);
          expect(detail).toHaveProperty('eventType', 'WebhookReceived');
          expect(detail).toHaveProperty('payload');
          expect(detail).toHaveProperty('traceId');
          expect(detail).toHaveProperty('timestamp');

          // traceId is a UUID v4
          expect(UUID_V4_RE.test(detail.traceId as string)).toBe(true);

          // timestamp is valid ISO 8601 (parseable by Date and not NaN)
          const ts = new Date(detail.timestamp as string);
          expect(Number.isNaN(ts.getTime())).toBe(false);
          // ISO 8601 strings produced by toISOString() end in 'Z'
          expect((detail.timestamp as string).endsWith('Z')).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 15: DomainEvent serialization round-trip ──
// Feature: event-triggering-routing, Property 15: DomainEvent serialization round-trip

describe('Feature: event-triggering-routing, Property 15: DomainEvent serialization round-trip', () => {
  /**
   * For any valid DomainEvent object, serializing to JSON then parsing back
   * produces an object deeply equal to the original.
   */
  it('JSON.parse(JSON.stringify(event)) deeply equals the original DomainEvent', () => {
    const arbJsonSafeValue = fc.jsonValue().map((v) => JSON.parse(JSON.stringify(v)));

    const arbDomainEvent = fc.record({
      tenantId: fc.string(),
      workflowId: fc.string(),
      eventType: fc.string(),
      payload: arbJsonSafeValue,
      traceId: fc.string(),
      timestamp: fc.string(),
    });

    fc.assert(
      fc.property(arbDomainEvent, (domainEvent) => {
        const roundTripped = JSON.parse(JSON.stringify(domainEvent)) as typeof domainEvent;
        expect(roundTripped).toEqual(domainEvent);
      }),
      { numRuns: 100 },
    );
  });
});
