import { describe, it, expect } from 'vitest';
import {
  createV1RunHandler,
  type V1RunRecord,
  type V1RunStep,
  type V1RunRepository,
} from './runs.js';

// ── Helpers ──

function makeStep(overrides: Partial<V1RunStep> = {}): V1RunStep {
  return {
    stepId: 'step-1',
    stepIndex: 0,
    status: 'COMPLETED',
    startedAt: '2024-01-01T00:00:00Z',
    completedAt: '2024-01-01T01:00:00Z',
    ...overrides,
  };
}

function makeRecord(overrides: Partial<V1RunRecord> = {}): V1RunRecord {
  return {
    runId: 'run-1',
    tenantId: 'tenant-1',
    workflowId: 'wf-1',
    status: 'COMPLETED',
    triggerType: 'api',
    traceId: 'trace-1',
    startedAt: '2024-01-01T00:00:00Z',
    completedAt: '2024-01-01T01:00:00Z',
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeRepo(records: V1RunRecord[] = []): V1RunRepository {
  const store = [...records];

  return {
    list: async (tenantId) => store.filter((r) => r.tenantId === tenantId),
    getById: async (tenantId, runId) =>
      store.find((r) => r.tenantId === tenantId && r.runId === runId) ?? null,
  };
}

// ── list ──

describe('createV1RunHandler.list', () => {
  it('returns 200 with all runs for tenant', async () => {
    const records = [
      makeRecord({ runId: 'run-1' }),
      makeRecord({ runId: 'run-2', workflowId: 'wf-2' }),
    ];
    const handler = createV1RunHandler(makeRepo(records));
    const result = await handler.list('tenant-1');

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.runs).toHaveLength(2);
  });

  it('returns empty array when no runs exist', async () => {
    const handler = createV1RunHandler(makeRepo());
    const result = await handler.list('tenant-1');

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.runs).toEqual([]);
  });

  it('filters by workflowId', async () => {
    const records = [
      makeRecord({ runId: 'run-1', workflowId: 'wf-1' }),
      makeRecord({ runId: 'run-2', workflowId: 'wf-2' }),
      makeRecord({ runId: 'run-3', workflowId: 'wf-1' }),
    ];
    const handler = createV1RunHandler(makeRepo(records));
    const result = await handler.list('tenant-1', { workflowId: 'wf-1' });

    const body = JSON.parse(result.body);
    expect(body.runs).toHaveLength(2);
    for (const run of body.runs) {
      expect(run.workflowId).toBe('wf-1');
    }
  });

  it('filters by status', async () => {
    const records = [
      makeRecord({ runId: 'run-1', status: 'COMPLETED' }),
      makeRecord({ runId: 'run-2', status: 'FAILED' }),
      makeRecord({ runId: 'run-3', status: 'COMPLETED' }),
    ];
    const handler = createV1RunHandler(makeRepo(records));
    const result = await handler.list('tenant-1', { status: 'FAILED' });

    const body = JSON.parse(result.body);
    expect(body.runs).toHaveLength(1);
    expect(body.runs[0].runId).toBe('run-2');
  });

  it('respects limit parameter', async () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      makeRecord({ runId: `run-${i}` }),
    );
    const handler = createV1RunHandler(makeRepo(records));
    const result = await handler.list('tenant-1', { limit: '3' });

    const body = JSON.parse(result.body);
    expect(body.runs).toHaveLength(3);
    expect(body.cursor).toBeDefined();
  });

  it('uses default limit of 50', async () => {
    const records = Array.from({ length: 60 }, (_, i) =>
      makeRecord({ runId: `run-${i}` }),
    );
    const handler = createV1RunHandler(makeRepo(records));
    const result = await handler.list('tenant-1');

    const body = JSON.parse(result.body);
    expect(body.runs).toHaveLength(50);
    expect(body.cursor).toBeDefined();
  });

  it('cursor pagination returns next page without duplicates', async () => {
    const records = Array.from({ length: 5 }, (_, i) =>
      makeRecord({ runId: `run-${i}` }),
    );
    const handler = createV1RunHandler(makeRepo(records));

    // First page
    const result1 = await handler.list('tenant-1', { limit: '3' });
    const body1 = JSON.parse(result1.body);
    expect(body1.runs).toHaveLength(3);
    expect(body1.cursor).toBeDefined();

    // Second page
    const result2 = await handler.list('tenant-1', { limit: '3', cursor: body1.cursor });
    const body2 = JSON.parse(result2.body);
    expect(body2.runs).toHaveLength(2);
    expect(body2.cursor).toBeUndefined();

    // No duplicates
    const page1Ids = body1.runs.map((r: { runId: string }) => r.runId);
    const page2Ids = body2.runs.map((r: { runId: string }) => r.runId);
    const allIds = [...page1Ids, ...page2Ids];
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('returns no cursor when all results fit in one page', async () => {
    const records = [makeRecord({ runId: 'run-1' }), makeRecord({ runId: 'run-2' })];
    const handler = createV1RunHandler(makeRepo(records));
    const result = await handler.list('tenant-1');

    const body = JSON.parse(result.body);
    expect(body.runs).toHaveLength(2);
    expect(body.cursor).toBeUndefined();
  });

  it('excludes payload, rawPayload, and steps from list response', async () => {
    const records = [
      makeRecord({
        runId: 'run-1',
        payload: { sensitive: 'data' },
        rawPayload: { raw: 'secret' },
        steps: [makeStep({ rawInput: { in: 'x' }, rawOutput: { out: 'y' } })],
      }),
    ];
    const handler = createV1RunHandler(makeRepo(records));
    const result = await handler.list('tenant-1');

    const body = JSON.parse(result.body);
    expect(body.runs).toHaveLength(1);
    expect(body.runs[0]).not.toHaveProperty('payload');
    expect(body.runs[0]).not.toHaveProperty('rawPayload');
    expect(body.runs[0]).not.toHaveProperty('steps');
  });

  it('sets Content-Type to application/json', async () => {
    const handler = createV1RunHandler(makeRepo());
    const result = await handler.list('tenant-1');
    expect(result.headers?.['Content-Type']).toBe('application/json');
  });
});

// ── getById ──

describe('createV1RunHandler.getById', () => {
  it('returns 200 with run detail', async () => {
    const records = [makeRecord({ steps: [makeStep()] })];
    const handler = createV1RunHandler(makeRepo(records));
    const result = await handler.getById('tenant-1', 'run-1');

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.runId).toBe('run-1');
    expect(body.workflowId).toBe('wf-1');
    expect(body.status).toBe('COMPLETED');
    expect(Array.isArray(body.steps)).toBe(true);
  });

  it('returns 404 when run not found', async () => {
    const handler = createV1RunHandler(makeRepo());
    const result = await handler.getById('tenant-1', 'nonexistent');

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body)).toEqual({ error: 'Not found' });
  });

  it('returns 404 for wrong tenant', async () => {
    const records = [makeRecord({ tenantId: 'tenant-1' })];
    const handler = createV1RunHandler(makeRepo(records));
    const result = await handler.getById('tenant-2', 'run-1');

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body)).toEqual({ error: 'Not found' });
  });

  it('excludes rawPayload and payload from detail response', async () => {
    const records = [
      makeRecord({
        payload: { sensitive: 'data' },
        rawPayload: { raw: 'secret' },
        steps: [makeStep()],
      }),
    ];
    const handler = createV1RunHandler(makeRepo(records));
    const result = await handler.getById('tenant-1', 'run-1');

    const body = JSON.parse(result.body);
    expect(body).not.toHaveProperty('rawPayload');
    expect(body).not.toHaveProperty('payload');
  });

  it('excludes rawInput and rawOutput from steps in detail response', async () => {
    const records = [
      makeRecord({
        steps: [
          makeStep({ rawInput: { in: 'secret' }, rawOutput: { out: 'secret' } }),
          makeStep({ stepId: 'step-2', stepIndex: 1, rawInput: { x: 1 }, rawOutput: { y: 2 } }),
        ],
      }),
    ];
    const handler = createV1RunHandler(makeRepo(records));
    const result = await handler.getById('tenant-1', 'run-1');

    const body = JSON.parse(result.body);
    for (const step of body.steps) {
      expect(step).not.toHaveProperty('rawInput');
      expect(step).not.toHaveProperty('rawOutput');
      expect(step).toHaveProperty('stepId');
      expect(step).toHaveProperty('stepIndex');
      expect(step).toHaveProperty('status');
    }
  });

  it('returns empty steps array when run has no steps', async () => {
    const records = [makeRecord()];
    const handler = createV1RunHandler(makeRepo(records));
    const result = await handler.getById('tenant-1', 'run-1');

    const body = JSON.parse(result.body);
    expect(body.steps).toEqual([]);
  });

  it('sets Content-Type to application/json', async () => {
    const handler = createV1RunHandler(makeRepo([makeRecord()]));
    const result = await handler.getById('tenant-1', 'run-1');
    expect(result.headers?.['Content-Type']).toBe('application/json');
  });
});
