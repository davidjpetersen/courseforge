import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import {
  createV1RunHandler,
  type V1RunRecord,
  type V1RunStep,
  type V1RunRepository,
} from './runs.js';

// ── Arbitraries ──

const arbNonEmptyString = fc.stringOf(
  fc.constantFrom('a', 'b', 'c', 'd', 'e', '1', '2', '-'),
  { minLength: 1, maxLength: 20 },
);

const arbRunStatus = fc.constantFrom('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

const arbStep: fc.Arbitrary<V1RunStep> = fc.record({
  stepId: fc.uuid(),
  stepIndex: fc.nat({ max: 20 }),
  status: fc.constantFrom('PENDING', 'RUNNING', 'COMPLETED', 'FAILED'),
  startedAt: fc.date().map((d) => d.toISOString()),
  completedAt: fc.option(fc.date().map((d) => d.toISOString()), { nil: null }),
  rawInput: fc.option(fc.constant({ secret: 'input-data' } as Record<string, unknown>), { nil: undefined }),
  rawOutput: fc.option(fc.constant({ secret: 'output-data' } as Record<string, unknown>), { nil: undefined }),
});

const arbRunRecord: fc.Arbitrary<V1RunRecord> = fc.record({
  runId: fc.uuid(),
  tenantId: fc.constant('tenant-1'),
  workflowId: arbNonEmptyString,
  status: arbRunStatus,
  triggerType: fc.constantFrom('api', 'webhook', 'schedule'),
  traceId: fc.uuid(),
  startedAt: fc.date().map((d) => d.toISOString()),
  completedAt: fc.option(fc.date().map((d) => d.toISOString()), { nil: null }),
  createdAt: fc.date().map((d) => d.toISOString()),
  payload: fc.option(fc.constant({ sensitive: 'data' } as Record<string, unknown>), { nil: undefined }),
  rawPayload: fc.option(fc.constant({ raw: 'secret' } as Record<string, unknown>), { nil: undefined }),
  steps: fc.option(fc.array(arbStep, { maxLength: 5 }), { nil: undefined }),
});

// ── In-memory mock V1RunRepository ──

function makeRepo(records: V1RunRecord[] = []): V1RunRepository {
  const store = [...records];

  return {
    list: async (tenantId) => store.filter((r) => r.tenantId === tenantId),
    getById: async (tenantId, runId) =>
      store.find((r) => r.tenantId === tenantId && r.runId === runId) ?? null,
  };
}


// ── Property 14: Run listing filters and pagination ──

describe('Feature: developer-rest-api, Property 14: Run listing filters and pagination', () => {
  /**
   * Validates: Requirements 12.1, 12.2, 12.3, 12.4
   *
   * For any set of runs and filter parameters (workflowId, status),
   * the listing response SHALL contain only matching runs.
   * For any limit value, the response SHALL contain at most limit items (default 50).
   * When a cursor is provided, the next page SHALL contain no duplicates from previous pages.
   */

  it('workflowId filter returns only runs with matching workflowId', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbRunRecord, { minLength: 1, maxLength: 15 }),
        arbNonEmptyString,
        async (records, filterWorkflowId) => {
          const handler = createV1RunHandler(makeRepo(records));
          const result = await handler.list('tenant-1', { workflowId: filterWorkflowId });

          expect(result.statusCode).toBe(200);
          const body = JSON.parse(result.body);
          const expected = records.filter((r) => r.workflowId === filterWorkflowId);

          expect(body.runs.length).toBeLessThanOrEqual(50);
          for (const run of body.runs) {
            expect(run.workflowId).toBe(filterWorkflowId);
          }
          // If fewer than 50 expected, count should match
          if (expected.length <= 50) {
            expect(body.runs).toHaveLength(expected.length);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('status filter returns only runs with matching status', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbRunRecord, { minLength: 1, maxLength: 15 }),
        arbRunStatus,
        async (records, filterStatus) => {
          const handler = createV1RunHandler(makeRepo(records));
          const result = await handler.list('tenant-1', { status: filterStatus });

          expect(result.statusCode).toBe(200);
          const body = JSON.parse(result.body);
          const expected = records.filter((r) => r.status === filterStatus);

          for (const run of body.runs) {
            expect(run.status).toBe(filterStatus);
          }
          if (expected.length <= 50) {
            expect(body.runs).toHaveLength(expected.length);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('combined workflowId + status filter returns only matching runs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbRunRecord, { minLength: 1, maxLength: 15 }),
        arbNonEmptyString,
        arbRunStatus,
        async (records, filterWorkflowId, filterStatus) => {
          const handler = createV1RunHandler(makeRepo(records));
          const result = await handler.list('tenant-1', {
            workflowId: filterWorkflowId,
            status: filterStatus,
          });

          expect(result.statusCode).toBe(200);
          const body = JSON.parse(result.body);
          const expected = records.filter(
            (r) => r.workflowId === filterWorkflowId && r.status === filterStatus,
          );

          for (const run of body.runs) {
            expect(run.workflowId).toBe(filterWorkflowId);
            expect(run.status).toBe(filterStatus);
          }
          if (expected.length <= 50) {
            expect(body.runs).toHaveLength(expected.length);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('limit constrains response size (default 50)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbRunRecord, { minLength: 0, maxLength: 20 }),
        fc.integer({ min: 1, max: 100 }),
        async (records, limit) => {
          const handler = createV1RunHandler(makeRepo(records));
          const result = await handler.list('tenant-1', { limit: String(limit) });

          expect(result.statusCode).toBe(200);
          const body = JSON.parse(result.body);
          expect(body.runs.length).toBeLessThanOrEqual(limit);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('default limit is 50 when not specified', async () => {
    // Create 60 records to exceed default limit
    const records: V1RunRecord[] = [];
    for (let i = 0; i < 60; i++) {
      records.push({
        runId: `run-${i}`,
        tenantId: 'tenant-1',
        workflowId: 'wf-1',
        status: 'COMPLETED',
        triggerType: 'api',
        traceId: `trace-${i}`,
        startedAt: '2024-01-01T00:00:00Z',
        completedAt: '2024-01-01T01:00:00Z',
        createdAt: '2024-01-01T00:00:00Z',
      });
    }

    const handler = createV1RunHandler(makeRepo(records));
    const result = await handler.list('tenant-1');

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.runs).toHaveLength(50);
    expect(body.cursor).toBeDefined();
  });

  it('cursor pagination produces no duplicates across pages', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          arbRunRecord.map((r, i) => ({ ...r, runId: `run-${i}-${r.runId}` })),
          { minLength: 3, maxLength: 20 },
        ),
        fc.integer({ min: 1, max: 5 }),
        async (records, limit) => {
          // Ensure unique runIds
          const uniqueRecords = records.map((r, i) => ({ ...r, runId: `run-${i}` }));
          const handler = createV1RunHandler(makeRepo(uniqueRecords));

          const allRunIds = new Set<string>();
          let cursor: string | undefined;

          // Paginate through all pages
          for (let page = 0; page < 100; page++) {
            const query: Record<string, string | undefined> = { limit: String(limit) };
            if (cursor) query.cursor = cursor;

            const result = await handler.list('tenant-1', query);
            const body = JSON.parse(result.body);

            for (const run of body.runs) {
              expect(allRunIds.has(run.runId)).toBe(false);
              allRunIds.add(run.runId);
            }

            if (!body.cursor) break;
            cursor = body.cursor;
          }

          // All runs should have been returned
          expect(allRunIds.size).toBe(uniqueRecords.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('no filter returns all runs for the tenant', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbRunRecord, { minLength: 0, maxLength: 15 }),
        async (records) => {
          const handler = createV1RunHandler(makeRepo(records));
          const result = await handler.list('tenant-1');

          expect(result.statusCode).toBe(200);
          const body = JSON.parse(result.body);
          // All records have tenantId 'tenant-1', so all should be returned (up to limit)
          expect(body.runs.length).toBeLessThanOrEqual(50);
          if (records.length <= 50) {
            expect(body.runs).toHaveLength(records.length);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ── Property 15: Response masking excludes sensitive data (runs) ──

describe('Feature: developer-rest-api, Property 15: Response masking excludes sensitive data (runs)', () => {
  /**
   * Validates: Requirements 12.5, 13.2
   *
   * For any run listing, payload/rawPayload/steps are excluded.
   * For any run detail, rawPayload is excluded and steps have no rawInput/rawOutput.
   */

  it('list response never contains payload, rawPayload, or steps', async () => {
    const arbRunWithSensitive = arbRunRecord.map((r) => ({
      ...r,
      payload: { sensitive: 'data' },
      rawPayload: { raw: 'secret' },
      steps: [
        {
          stepId: 'step-1',
          stepIndex: 0,
          status: 'COMPLETED',
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-01T01:00:00Z',
          rawInput: { input: 'secret' },
          rawOutput: { output: 'secret' },
        },
      ],
    }));

    await fc.assert(
      fc.asyncProperty(
        fc.array(arbRunWithSensitive, { minLength: 1, maxLength: 10 }),
        async (records) => {
          const handler = createV1RunHandler(makeRepo(records));
          const result = await handler.list('tenant-1');

          expect(result.statusCode).toBe(200);
          const body = JSON.parse(result.body);

          for (const run of body.runs) {
            expect(run).not.toHaveProperty('payload');
            expect(run).not.toHaveProperty('rawPayload');
            expect(run).not.toHaveProperty('steps');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('getById response never contains rawPayload', async () => {
    const arbRunWithRawPayload = arbRunRecord.map((r) => ({
      ...r,
      rawPayload: { raw: 'secret-data', credentials: { token: 'abc' } },
      steps: [
        {
          stepId: 'step-1',
          stepIndex: 0,
          status: 'COMPLETED',
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-01T01:00:00Z',
          rawInput: { input: 'secret' },
          rawOutput: { output: 'secret' },
        },
      ],
    }));

    await fc.assert(
      fc.asyncProperty(arbRunWithRawPayload, async (record) => {
        const handler = createV1RunHandler(makeRepo([record]));
        const result = await handler.getById(record.tenantId, record.runId);

        expect(result.statusCode).toBe(200);
        const body = JSON.parse(result.body);
        expect(body).not.toHaveProperty('rawPayload');
        expect(body).not.toHaveProperty('payload');
        expect(body.runId).toBe(record.runId);
      }),
      { numRuns: 100 },
    );
  });

  it('getById response steps never contain rawInput or rawOutput', async () => {
    const arbRunWithSteps = arbRunRecord.map((r) => ({
      ...r,
      steps: [
        {
          stepId: 'step-1',
          stepIndex: 0,
          status: 'COMPLETED',
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: '2024-01-01T01:00:00Z',
          rawInput: { input: 'secret-input' },
          rawOutput: { output: 'secret-output' },
        },
        {
          stepId: 'step-2',
          stepIndex: 1,
          status: 'RUNNING',
          startedAt: '2024-01-01T00:00:00Z',
          completedAt: null,
          rawInput: { another: 'input' },
          rawOutput: { another: 'output' },
        },
      ],
    }));

    await fc.assert(
      fc.asyncProperty(arbRunWithSteps, async (record) => {
        const handler = createV1RunHandler(makeRepo([record]));
        const result = await handler.getById(record.tenantId, record.runId);

        expect(result.statusCode).toBe(200);
        const body = JSON.parse(result.body);

        expect(Array.isArray(body.steps)).toBe(true);
        for (const step of body.steps) {
          expect(step).not.toHaveProperty('rawInput');
          expect(step).not.toHaveProperty('rawOutput');
          // Ensure non-sensitive step fields are preserved
          expect(step).toHaveProperty('stepId');
          expect(step).toHaveProperty('stepIndex');
          expect(step).toHaveProperty('status');
          expect(step).toHaveProperty('startedAt');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('getById preserves non-sensitive run fields', async () => {
    await fc.assert(
      fc.asyncProperty(arbRunRecord, async (record) => {
        const handler = createV1RunHandler(makeRepo([record]));
        const result = await handler.getById(record.tenantId, record.runId);

        expect(result.statusCode).toBe(200);
        const body = JSON.parse(result.body);

        expect(body.runId).toBe(record.runId);
        expect(body.tenantId).toBe(record.tenantId);
        expect(body.workflowId).toBe(record.workflowId);
        expect(body.status).toBe(record.status);
        expect(body.triggerType).toBe(record.triggerType);
        expect(body.traceId).toBe(record.traceId);
      }),
      { numRuns: 100 },
    );
  });
});
