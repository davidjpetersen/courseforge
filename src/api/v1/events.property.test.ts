import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import {
  createV1EventHandler,
  validateEventBody,
  type EventHandlerDeps,
  type DomainEventInput,
  type RunInput,
} from './events.js';

// ── Arbitraries ──

const arbNonEmptyString = fc.stringOf(
  fc.constantFrom('a', 'b', 'c', 'd', 'e', '1', '2', '-'),
  { minLength: 1, maxLength: 20 },
);

const arbTenantId = arbNonEmptyString.map((s) => `tenant-${s}`);
const arbWorkflowId = fc.uuid();
const arbPayload = fc.dictionary(arbNonEmptyString, fc.oneof(fc.string(), fc.integer(), fc.boolean()));

const arbWorkflowStatus = fc.constantFrom('DRAFT', 'PUBLISHED', 'ARCHIVED', 'DISABLED');
const arbNonPublishedStatus = fc.constantFrom('DRAFT', 'ARCHIVED', 'DISABLED');

// ── Mock deps factory ──

function makeDeps(overrides: {
  workflow?: { workflowId: string; tenantId: string; status: string } | null;
} = {}): EventHandlerDeps & {
  publishedEvents: DomainEventInput[];
  createdRuns: RunInput[];
} {
  const publishedEvents: DomainEventInput[] = [];
  const createdRuns: RunInput[] = [];

  return {
    publishedEvents,
    createdRuns,
    workflowRepo: {
      getById: async (_tenantId: string, _workflowId: string) =>
        overrides.workflow !== undefined ? overrides.workflow : null,
    },
    eventPublisher: {
      publish: async (event: DomainEventInput) => {
        publishedEvents.push(event);
      },
    },
    runRepo: {
      create: async (run: RunInput) => {
        createdRuns.push(run);
      },
    },
  };
}


// ── Property 9: Invalid input validation returns 400 (event triggering) ──

describe('Feature: developer-rest-api, Property 9: Invalid input validation returns 400 (event triggering)', () => {
  /**
   * Validates: Requirements 11.4
   *
   * For any body missing workflowId or payload, or with invalid types,
   * the handler SHALL return a 400 status code with a descriptive error message.
   */

  it('rejects non-object bodies', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constant(null),
          fc.constant(undefined),
          fc.string(),
          fc.integer(),
          fc.boolean(),
          fc.array(fc.anything()),
        ),
        async (invalidBody) => {
          const error = validateEventBody(invalidBody);
          expect(error).not.toBeNull();
          expect(typeof error).toBe('string');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects bodies missing workflowId', async () => {
    await fc.assert(
      fc.asyncProperty(arbPayload, async (payload) => {
        const body = { payload };

        const deps = makeDeps();
        const handler = createV1EventHandler(deps);
        const result = await handler.trigger('tenant-1', body);

        expect(result.statusCode).toBe(400);
        const parsed = JSON.parse(result.body);
        expect(parsed).toHaveProperty('error');
        expect(parsed.error.toLowerCase()).toContain('workflowid');
      }),
      { numRuns: 100 },
    );
  });

  it('rejects bodies missing payload', async () => {
    await fc.assert(
      fc.asyncProperty(arbNonEmptyString, async (workflowId) => {
        const body = { workflowId };

        const deps = makeDeps();
        const handler = createV1EventHandler(deps);
        const result = await handler.trigger('tenant-1', body);

        expect(result.statusCode).toBe(400);
        const parsed = JSON.parse(result.body);
        expect(parsed).toHaveProperty('error');
        expect(parsed.error.toLowerCase()).toContain('payload');
      }),
      { numRuns: 100 },
    );
  });

  it('rejects non-string workflowId', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.integer(), fc.boolean(), fc.constant(null), fc.array(fc.anything())),
        async (invalidWorkflowId) => {
          const body = { workflowId: invalidWorkflowId, payload: { key: 'value' } };

          const deps = makeDeps();
          const handler = createV1EventHandler(deps);
          const result = await handler.trigger('tenant-1', body);

          expect(result.statusCode).toBe(400);
          const parsed = JSON.parse(result.body);
          expect(parsed).toHaveProperty('error');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects empty or whitespace-only workflowId', async () => {
    const arbWhitespace = fc.stringOf(fc.constantFrom(' ', '\t', '\n'), { minLength: 0, maxLength: 5 });

    await fc.assert(
      fc.asyncProperty(arbWhitespace, async (emptyId) => {
        const body = { workflowId: emptyId, payload: { key: 'value' } };

        const deps = makeDeps();
        const handler = createV1EventHandler(deps);
        const result = await handler.trigger('tenant-1', body);

        expect(result.statusCode).toBe(400);
        const parsed = JSON.parse(result.body);
        expect(parsed).toHaveProperty('error');
      }),
      { numRuns: 100 },
    );
  });

  it('rejects non-object payload', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.string(),
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
          fc.array(fc.anything()),
        ),
        async (invalidPayload) => {
          const body = { workflowId: 'wf-1', payload: invalidPayload };

          const deps = makeDeps();
          const handler = createV1EventHandler(deps);
          const result = await handler.trigger('tenant-1', body);

          expect(result.statusCode).toBe(400);
          const parsed = JSON.parse(result.body);
          expect(parsed).toHaveProperty('error');
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ── Property 11: Event triggering ownership and status validation ──

describe('Feature: developer-rest-api, Property 11: Event triggering ownership and status validation', () => {
  /**
   * Validates: Requirements 11.1, 11.2, 11.3
   *
   * For any (tenantId, workflowId) pair, returns 202 iff workflow belongs to tenant
   * and is PUBLISHED; otherwise 409.
   */

  it('returns 202 when workflow belongs to tenant and is PUBLISHED', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbTenantId,
        arbWorkflowId,
        arbPayload,
        async (tenantId, workflowId, payload) => {
          const deps = makeDeps({
            workflow: { workflowId, tenantId, status: 'PUBLISHED' },
          });
          const handler = createV1EventHandler(deps);
          const result = await handler.trigger(tenantId, { workflowId, payload });

          expect(result.statusCode).toBe(202);
          const body = JSON.parse(result.body);
          expect(body).toHaveProperty('runId');
          expect(body).toHaveProperty('traceId');
          expect(typeof body.runId).toBe('string');
          expect(typeof body.traceId).toBe('string');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns 409 when workflow is not PUBLISHED', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbTenantId,
        arbWorkflowId,
        arbNonPublishedStatus,
        arbPayload,
        async (tenantId, workflowId, status, payload) => {
          const deps = makeDeps({
            workflow: { workflowId, tenantId, status },
          });
          const handler = createV1EventHandler(deps);
          const result = await handler.trigger(tenantId, { workflowId, payload });

          expect(result.statusCode).toBe(409);
          const body = JSON.parse(result.body);
          expect(body).toHaveProperty('error');
          expect(body.error).toBe('Workflow is not in a triggerable state');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns 409 when workflow does not exist (not found)', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbTenantId,
        arbWorkflowId,
        arbPayload,
        async (tenantId, workflowId, payload) => {
          const deps = makeDeps({ workflow: null });
          const handler = createV1EventHandler(deps);
          const result = await handler.trigger(tenantId, { workflowId, payload });

          expect(result.statusCode).toBe(409);
          const body = JSON.parse(result.body);
          expect(body.error).toBe('Workflow is not in a triggerable state');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns 409 when workflow belongs to a different tenant', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbTenantId,
        arbWorkflowId,
        arbPayload,
        async (tenantId, workflowId, payload) => {
          // Workflow exists but belongs to a different tenant — repo returns null for this tenant
          const deps = makeDeps({ workflow: null });
          const handler = createV1EventHandler(deps);
          const result = await handler.trigger(tenantId, { workflowId, payload });

          expect(result.statusCode).toBe(409);
          const body = JSON.parse(result.body);
          expect(body.error).toBe('Workflow is not in a triggerable state');
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ── Property 12: Event triggering creates correct domain event and run record ──

describe('Feature: developer-rest-api, Property 12: Event triggering creates correct domain event and run record', () => {
  /**
   * Validates: Requirements 11.2
   *
   * For any valid trigger, the published DomainEvent has correct fields
   * and the Run record has status PENDING and triggerType 'api'.
   */

  it('publishes a DomainEvent with correct fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbTenantId,
        arbWorkflowId,
        arbPayload,
        async (tenantId, workflowId, payload) => {
          const deps = makeDeps({
            workflow: { workflowId, tenantId, status: 'PUBLISHED' },
          });
          const handler = createV1EventHandler(deps);
          await handler.trigger(tenantId, { workflowId, payload });

          expect(deps.publishedEvents).toHaveLength(1);
          const event = deps.publishedEvents[0];
          expect(event.tenantId).toBe(tenantId);
          expect(event.workflowId).toBe(workflowId);
          expect(event.eventType).toBe('ApiEventReceived');
          expect(event.payload).toEqual(payload);
          expect(typeof event.traceId).toBe('string');
          expect(event.traceId.length).toBeGreaterThan(0);
          expect(typeof event.timestamp).toBe('string');
          expect(event.timestamp.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('creates a Run record with status PENDING and triggerType api', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbTenantId,
        arbWorkflowId,
        arbPayload,
        async (tenantId, workflowId, payload) => {
          const deps = makeDeps({
            workflow: { workflowId, tenantId, status: 'PUBLISHED' },
          });
          const handler = createV1EventHandler(deps);
          await handler.trigger(tenantId, { workflowId, payload });

          expect(deps.createdRuns).toHaveLength(1);
          const run = deps.createdRuns[0];
          expect(run.tenantId).toBe(tenantId);
          expect(run.workflowId).toBe(workflowId);
          expect(run.triggerType).toBe('api');
          expect(run.status).toBe('PENDING');
          expect(typeof run.runId).toBe('string');
          expect(run.runId.length).toBeGreaterThan(0);
          expect(typeof run.traceId).toBe('string');
          expect(run.traceId.length).toBeGreaterThan(0);
          expect(typeof run.startedAt).toBe('string');
          expect(typeof run.createdAt).toBe('string');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('uses the same traceId across event, run, and response', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbTenantId,
        arbWorkflowId,
        arbPayload,
        async (tenantId, workflowId, payload) => {
          const deps = makeDeps({
            workflow: { workflowId, tenantId, status: 'PUBLISHED' },
          });
          const handler = createV1EventHandler(deps);
          const result = await handler.trigger(tenantId, { workflowId, payload });

          const responseBody = JSON.parse(result.body);
          expect(deps.publishedEvents[0].traceId).toBe(responseBody.traceId);
          expect(deps.createdRuns[0].traceId).toBe(responseBody.traceId);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('uses the same runId in run record and response', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbTenantId,
        arbWorkflowId,
        arbPayload,
        async (tenantId, workflowId, payload) => {
          const deps = makeDeps({
            workflow: { workflowId, tenantId, status: 'PUBLISHED' },
          });
          const handler = createV1EventHandler(deps);
          const result = await handler.trigger(tenantId, { workflowId, payload });

          const responseBody = JSON.parse(result.body);
          expect(deps.createdRuns[0].runId).toBe(responseBody.runId);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('does not publish event or create run on invalid input', async () => {
    await fc.assert(
      fc.asyncProperty(arbTenantId, async (tenantId) => {
        const deps = makeDeps({
          workflow: { workflowId: 'wf-1', tenantId, status: 'PUBLISHED' },
        });
        const handler = createV1EventHandler(deps);
        // Missing payload
        await handler.trigger(tenantId, { workflowId: 'wf-1' });

        expect(deps.publishedEvents).toHaveLength(0);
        expect(deps.createdRuns).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });

  it('does not publish event or create run when workflow is not triggerable', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbTenantId,
        arbWorkflowId,
        arbNonPublishedStatus,
        arbPayload,
        async (tenantId, workflowId, status, payload) => {
          const deps = makeDeps({
            workflow: { workflowId, tenantId, status },
          });
          const handler = createV1EventHandler(deps);
          await handler.trigger(tenantId, { workflowId, payload });

          expect(deps.publishedEvents).toHaveLength(0);
          expect(deps.createdRuns).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
