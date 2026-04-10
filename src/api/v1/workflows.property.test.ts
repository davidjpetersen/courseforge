import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import {
  createV1WorkflowHandler,
  validateCreateBody,
  type V1WorkflowRecord,
  type V1WorkflowRepository,
} from './workflows';

// ── Arbitraries ──

const arbNonEmptyString = fc.stringOf(
  fc.constantFrom('a', 'b', 'c', 'd', 'e', '1', '2', '-'),
  { minLength: 1, maxLength: 20 },
);

const arbStatus = fc.constantFrom('DRAFT', 'PUBLISHED', 'ARCHIVED');
const arbEnvironmentId = fc.constantFrom('dev', 'staging', 'production', 'test');

const arbWorkflowRecord: fc.Arbitrary<V1WorkflowRecord> = fc.record({
  workflowId: fc.uuid(),
  versionId: fc.uuid(),
  tenantId: fc.constant('tenant-1'),
  name: arbNonEmptyString,
  recipeId: arbNonEmptyString,
  status: arbStatus,
  environmentId: arbEnvironmentId,
  connectionIds: fc.array(arbNonEmptyString, { maxLength: 3 }),
  params: fc.constant({} as Record<string, unknown>),
  createdAt: fc.date().map((d) => d.toISOString()),
  updatedAt: fc.date().map((d) => d.toISOString()),
});

const arbWorkflowRecordWithCompiledPlan: fc.Arbitrary<V1WorkflowRecord> = arbWorkflowRecord.map(
  (r) => ({ ...r, compiledPlan: { secret: 'hidden-value', credentials: { token: 'abc123' } } }),
);

// ── In-memory mock repository ──

function makeRepo(records: V1WorkflowRecord[] = []): V1WorkflowRepository {
  const store = new Map<string, V1WorkflowRecord>();
  for (const r of records) {
    store.set(`${r.tenantId}#${r.workflowId}`, r);
  }

  return {
    create: async (workflow) => {
      store.set(`${workflow.tenantId}#${workflow.workflowId}`, workflow);
    },
    list: async (tenantId) =>
      [...store.values()].filter((r) => r.tenantId === tenantId),
    getById: async (tenantId, workflowId) =>
      store.get(`${tenantId}#${workflowId}`) ?? null,
    publish: async (tenantId, workflowId) => {
      const key = `${tenantId}#${workflowId}`;
      const existing = store.get(key);
      if (!existing) return null;
      const updated = { ...existing, status: 'PUBLISHED', updatedAt: new Date().toISOString() };
      store.set(key, updated);
      return updated;
    },
  };
}


// ── Property 9: Invalid input validation returns 400 (workflow creation) ──

describe('Feature: developer-rest-api, Property 9: Invalid input validation returns 400 (workflow creation)', () => {
  /**
   * Validates: Requirements 7.1, 7.2
   *
   * For any request body that is missing required fields or contains invalid field values,
   * the handler SHALL return a 400 status code with a descriptive error message.
   */

  it('rejects bodies missing required fields', async () => {
    const requiredFields = ['name', 'recipeId', 'params', 'environmentId', 'connectionIds'];

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...requiredFields),
        async (fieldToRemove) => {
          const validBody: Record<string, unknown> = {
            name: 'Test Workflow',
            recipeId: 'recipe-1',
            params: { foo: 'bar' },
            environmentId: 'production',
            connectionIds: ['conn-1'],
          };
          delete validBody[fieldToRemove];

          const handler = createV1WorkflowHandler(makeRepo());
          const result = await handler.create('tenant-1', validBody);

          expect(result.statusCode).toBe(400);
          const body = JSON.parse(result.body);
          expect(body).toHaveProperty('error');
          expect(typeof body.error).toBe('string');
          expect(body.error.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

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
          const error = validateCreateBody(invalidBody);
          expect(error).not.toBeNull();
          expect(typeof error).toBe('string');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects empty or whitespace-only name', async () => {
    const arbWhitespace = fc.stringOf(fc.constantFrom(' ', '\t', '\n'), { minLength: 0, maxLength: 5 });

    await fc.assert(
      fc.asyncProperty(arbWhitespace, async (emptyName) => {
        const body = {
          name: emptyName,
          recipeId: 'recipe-1',
          params: { foo: 'bar' },
          environmentId: 'production',
          connectionIds: ['conn-1'],
        };

        const handler = createV1WorkflowHandler(makeRepo());
        const result = await handler.create('tenant-1', body);

        expect(result.statusCode).toBe(400);
        const parsed = JSON.parse(result.body);
        expect(parsed).toHaveProperty('error');
      }),
      { numRuns: 100 },
    );
  });

  it('rejects invalid params types', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constant(null),
          fc.string(),
          fc.integer(),
          fc.array(fc.anything()),
        ),
        async (invalidParams) => {
          const body = {
            name: 'Test',
            recipeId: 'recipe-1',
            params: invalidParams,
            environmentId: 'production',
            connectionIds: ['conn-1'],
          };

          const handler = createV1WorkflowHandler(makeRepo());
          const result = await handler.create('tenant-1', body);

          expect(result.statusCode).toBe(400);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects non-array or non-string-array connectionIds', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constant('not-array'),
          fc.constant(123),
          fc.constant(null),
          fc.constant([1, 2, 3]),
          fc.constant([true, false]),
        ),
        async (invalidConnectionIds) => {
          const body = {
            name: 'Test',
            recipeId: 'recipe-1',
            params: { foo: 'bar' },
            environmentId: 'production',
            connectionIds: invalidConnectionIds,
          };

          const handler = createV1WorkflowHandler(makeRepo());
          const result = await handler.create('tenant-1', body);

          expect(result.statusCode).toBe(400);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('accepts valid bodies and returns 201', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbNonEmptyString,
        arbNonEmptyString,
        arbEnvironmentId,
        fc.array(arbNonEmptyString, { maxLength: 3 }),
        async (name, recipeId, environmentId, connectionIds) => {
          const body = {
            name,
            recipeId,
            params: { key: 'value' },
            environmentId,
            connectionIds,
          };

          const handler = createV1WorkflowHandler(makeRepo());
          const result = await handler.create('tenant-1', body);

          expect(result.statusCode).toBe(201);
          const parsed = JSON.parse(result.body);
          expect(parsed).toHaveProperty('workflowId');
          expect(parsed).toHaveProperty('versionId');
          expect(parsed.status).toBe('DRAFT');
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ── Property 13: Workflow listing filters correctly ──

describe('Feature: developer-rest-api, Property 13: Workflow listing filters correctly', () => {
  /**
   * Validates: Requirements 8.1, 8.2, 8.3
   *
   * For any set of workflows and a filter query parameter (status or environmentId),
   * the listing response SHALL contain only workflows matching the specified filter value.
   */

  it('status filter returns only workflows with matching status', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbWorkflowRecord, { minLength: 1, maxLength: 15 }),
        arbStatus,
        async (records, filterStatus) => {
          const handler = createV1WorkflowHandler(makeRepo(records));
          const result = await handler.list('tenant-1', { status: filterStatus });

          expect(result.statusCode).toBe(200);
          const body = JSON.parse(result.body);
          const expected = records.filter((r) => r.status === filterStatus);

          expect(body.workflows).toHaveLength(expected.length);
          for (const wf of body.workflows) {
            expect(wf.status).toBe(filterStatus);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('environmentId filter returns only workflows with matching environmentId', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbWorkflowRecord, { minLength: 1, maxLength: 15 }),
        arbEnvironmentId,
        async (records, filterEnv) => {
          const handler = createV1WorkflowHandler(makeRepo(records));
          const result = await handler.list('tenant-1', { environmentId: filterEnv });

          expect(result.statusCode).toBe(200);
          const body = JSON.parse(result.body);
          const expected = records.filter((r) => r.environmentId === filterEnv);

          expect(body.workflows).toHaveLength(expected.length);
          for (const wf of body.workflows) {
            expect(wf.environmentId).toBe(filterEnv);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('combined status + environmentId filter returns only matching workflows', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbWorkflowRecord, { minLength: 1, maxLength: 15 }),
        arbStatus,
        arbEnvironmentId,
        async (records, filterStatus, filterEnv) => {
          const handler = createV1WorkflowHandler(makeRepo(records));
          const result = await handler.list('tenant-1', {
            status: filterStatus,
            environmentId: filterEnv,
          });

          expect(result.statusCode).toBe(200);
          const body = JSON.parse(result.body);
          const expected = records.filter(
            (r) => r.status === filterStatus && r.environmentId === filterEnv,
          );

          expect(body.workflows).toHaveLength(expected.length);
          for (const wf of body.workflows) {
            expect(wf.status).toBe(filterStatus);
            expect(wf.environmentId).toBe(filterEnv);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('no filter returns all workflows for the tenant', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbWorkflowRecord, { minLength: 0, maxLength: 15 }),
        async (records) => {
          const handler = createV1WorkflowHandler(makeRepo(records));
          const result = await handler.list('tenant-1');

          expect(result.statusCode).toBe(200);
          const body = JSON.parse(result.body);
          expect(body.workflows).toHaveLength(records.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('only returns workflows for the requested tenant', async () => {
    const arbMultiTenantRecord = arbWorkflowRecord.chain((r) =>
      fc.constantFrom('tenant-1', 'tenant-2', 'tenant-3').map((tid) => ({
        ...r,
        tenantId: tid,
      })),
    );

    await fc.assert(
      fc.asyncProperty(
        fc.array(arbMultiTenantRecord, { minLength: 1, maxLength: 15 }),
        async (records) => {
          const handler = createV1WorkflowHandler(makeRepo(records));
          const result = await handler.list('tenant-1');

          expect(result.statusCode).toBe(200);
          const body = JSON.parse(result.body);
          const expected = records.filter((r) => r.tenantId === 'tenant-1');

          expect(body.workflows).toHaveLength(expected.length);
          for (const wf of body.workflows) {
            expect(wf.tenantId).toBe('tenant-1');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ── Property 15: Response masking excludes sensitive data (workflow detail) ──

describe('Feature: developer-rest-api, Property 15: Response masking excludes sensitive data (workflow detail)', () => {
  /**
   * Validates: Requirements 9.1, 9.2
   *
   * For any workflow detail response, compiledPlan SHALL be excluded.
   */

  it('getById response never contains compiledPlan', async () => {
    await fc.assert(
      fc.asyncProperty(arbWorkflowRecordWithCompiledPlan, async (record) => {
        const handler = createV1WorkflowHandler(makeRepo([record]));
        const result = await handler.getById(record.tenantId, record.workflowId);

        expect(result.statusCode).toBe(200);
        const body = JSON.parse(result.body);
        expect(body).not.toHaveProperty('compiledPlan');
        expect(body.workflowId).toBe(record.workflowId);
        expect(body.name).toBe(record.name);
      }),
      { numRuns: 100 },
    );
  });

  it('list response never contains compiledPlan in any workflow', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbWorkflowRecordWithCompiledPlan, { minLength: 1, maxLength: 10 }),
        async (records) => {
          const handler = createV1WorkflowHandler(makeRepo(records));
          const result = await handler.list('tenant-1');

          expect(result.statusCode).toBe(200);
          const body = JSON.parse(result.body);

          for (const wf of body.workflows) {
            expect(wf).not.toHaveProperty('compiledPlan');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('publish response never contains compiledPlan', async () => {
    await fc.assert(
      fc.asyncProperty(arbWorkflowRecordWithCompiledPlan, async (record) => {
        const handler = createV1WorkflowHandler(makeRepo([record]));
        const result = await handler.publish(record.tenantId, record.workflowId);

        expect(result.statusCode).toBe(200);
        const body = JSON.parse(result.body);
        expect(body).not.toHaveProperty('compiledPlan');
      }),
      { numRuns: 100 },
    );
  });
});
