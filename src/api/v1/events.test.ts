import { describe, it, expect } from 'vitest';
import {
  createV1EventHandler,
  validateEventBody,
  type EventHandlerDeps,
  type DomainEventInput,
  type RunInput,
} from './events.js';

// ── Helpers ──

function makeDeps(overrides: {
  workflow?: { workflowId: string; tenantId: string; status: string } | null;
  publishError?: Error;
  createRunError?: Error;
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
        if (overrides.publishError) throw overrides.publishError;
        publishedEvents.push(event);
      },
    },
    runRepo: {
      create: async (run: RunInput) => {
        if (overrides.createRunError) throw overrides.createRunError;
        createdRuns.push(run);
      },
    },
  };
}

// ── validateEventBody ──

describe('validateEventBody', () => {
  it('returns null for valid body', () => {
    expect(validateEventBody({ workflowId: 'wf-1', payload: { key: 'value' } })).toBeNull();
  });

  it('rejects non-object body', () => {
    expect(validateEventBody('string')).toBe('Request body must be a JSON object');
    expect(validateEventBody(null)).toBe('Request body must be a JSON object');
    expect(validateEventBody([1, 2])).toBe('Request body must be a JSON object');
  });

  it('rejects missing workflowId', () => {
    expect(validateEventBody({ payload: { key: 'value' } })).toContain('workflowId');
  });

  it('rejects empty workflowId', () => {
    expect(validateEventBody({ workflowId: '', payload: {} })).toContain('workflowId');
    expect(validateEventBody({ workflowId: '   ', payload: {} })).toContain('workflowId');
  });

  it('rejects non-string workflowId', () => {
    expect(validateEventBody({ workflowId: 123, payload: {} })).toContain('workflowId');
  });

  it('rejects missing payload', () => {
    expect(validateEventBody({ workflowId: 'wf-1' })).toContain('payload');
  });

  it('rejects non-object payload', () => {
    expect(validateEventBody({ workflowId: 'wf-1', payload: 'string' })).toContain('payload');
    expect(validateEventBody({ workflowId: 'wf-1', payload: null })).toContain('payload');
    expect(validateEventBody({ workflowId: 'wf-1', payload: [1] })).toContain('payload');
  });

  it('accepts empty payload object', () => {
    expect(validateEventBody({ workflowId: 'wf-1', payload: {} })).toBeNull();
  });
});

// ── trigger ──

describe('createV1EventHandler.trigger', () => {
  it('returns 202 with runId and traceId on success', async () => {
    const deps = makeDeps({
      workflow: { workflowId: 'wf-1', tenantId: 'tenant-1', status: 'PUBLISHED' },
    });
    const handler = createV1EventHandler(deps);
    const result = await handler.trigger('tenant-1', {
      workflowId: 'wf-1',
      payload: { data: 'test' },
    });

    expect(result.statusCode).toBe(202);
    const body = JSON.parse(result.body);
    expect(body).toHaveProperty('runId');
    expect(body).toHaveProperty('traceId');
    expect(typeof body.runId).toBe('string');
    expect(typeof body.traceId).toBe('string');
  });

  it('returns 400 for invalid body', async () => {
    const deps = makeDeps();
    const handler = createV1EventHandler(deps);
    const result = await handler.trigger('tenant-1', { workflowId: '' });

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toHaveProperty('error');
  });

  it('returns 400 when payload is missing', async () => {
    const deps = makeDeps();
    const handler = createV1EventHandler(deps);
    const result = await handler.trigger('tenant-1', { workflowId: 'wf-1' });

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('payload');
  });

  it('returns 409 when workflow not found', async () => {
    const deps = makeDeps({ workflow: null });
    const handler = createV1EventHandler(deps);
    const result = await handler.trigger('tenant-1', {
      workflowId: 'nonexistent',
      payload: { data: 'test' },
    });

    expect(result.statusCode).toBe(409);
    expect(JSON.parse(result.body).error).toBe('Workflow is not in a triggerable state');
  });

  it('returns 409 when workflow is not PUBLISHED', async () => {
    const deps = makeDeps({
      workflow: { workflowId: 'wf-1', tenantId: 'tenant-1', status: 'DRAFT' },
    });
    const handler = createV1EventHandler(deps);
    const result = await handler.trigger('tenant-1', {
      workflowId: 'wf-1',
      payload: { data: 'test' },
    });

    expect(result.statusCode).toBe(409);
    expect(JSON.parse(result.body).error).toBe('Workflow is not in a triggerable state');
  });

  it('publishes a DomainEvent with correct fields', async () => {
    const deps = makeDeps({
      workflow: { workflowId: 'wf-1', tenantId: 'tenant-1', status: 'PUBLISHED' },
    });
    const handler = createV1EventHandler(deps);
    await handler.trigger('tenant-1', {
      workflowId: 'wf-1',
      payload: { data: 'test' },
    });

    expect(deps.publishedEvents).toHaveLength(1);
    const event = deps.publishedEvents[0];
    expect(event.tenantId).toBe('tenant-1');
    expect(event.workflowId).toBe('wf-1');
    expect(event.eventType).toBe('ApiEventReceived');
    expect(event.payload).toEqual({ data: 'test' });
    expect(event.traceId).toBeDefined();
    expect(event.timestamp).toBeDefined();
  });

  it('creates a Run record with correct fields', async () => {
    const deps = makeDeps({
      workflow: { workflowId: 'wf-1', tenantId: 'tenant-1', status: 'PUBLISHED' },
    });
    const handler = createV1EventHandler(deps);
    await handler.trigger('tenant-1', {
      workflowId: 'wf-1',
      payload: { data: 'test' },
    });

    expect(deps.createdRuns).toHaveLength(1);
    const run = deps.createdRuns[0];
    expect(run.tenantId).toBe('tenant-1');
    expect(run.workflowId).toBe('wf-1');
    expect(run.triggerType).toBe('api');
    expect(run.status).toBe('PENDING');
    expect(run.runId).toBeDefined();
    expect(run.traceId).toBeDefined();
    expect(run.startedAt).toBeDefined();
    expect(run.createdAt).toBeDefined();
  });

  it('uses the same traceId in event, run, and response', async () => {
    const deps = makeDeps({
      workflow: { workflowId: 'wf-1', tenantId: 'tenant-1', status: 'PUBLISHED' },
    });
    const handler = createV1EventHandler(deps);
    const result = await handler.trigger('tenant-1', {
      workflowId: 'wf-1',
      payload: { data: 'test' },
    });

    const body = JSON.parse(result.body);
    expect(deps.publishedEvents[0].traceId).toBe(body.traceId);
    expect(deps.createdRuns[0].traceId).toBe(body.traceId);
  });

  it('uses the same runId in run record and response', async () => {
    const deps = makeDeps({
      workflow: { workflowId: 'wf-1', tenantId: 'tenant-1', status: 'PUBLISHED' },
    });
    const handler = createV1EventHandler(deps);
    const result = await handler.trigger('tenant-1', {
      workflowId: 'wf-1',
      payload: { data: 'test' },
    });

    const body = JSON.parse(result.body);
    expect(deps.createdRuns[0].runId).toBe(body.runId);
  });

  it('sets Content-Type to application/json', async () => {
    const deps = makeDeps({
      workflow: { workflowId: 'wf-1', tenantId: 'tenant-1', status: 'PUBLISHED' },
    });
    const handler = createV1EventHandler(deps);
    const result = await handler.trigger('tenant-1', {
      workflowId: 'wf-1',
      payload: {},
    });

    expect(result.headers?.['Content-Type']).toBe('application/json');
  });
});
