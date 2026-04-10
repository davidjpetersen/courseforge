import { describe, it, expect } from 'vitest';
import {
  createV1WorkflowHandler,
  validateCreateBody,
  type V1WorkflowRecord,
  type V1WorkflowRepository,
} from './workflows';

// ── Helpers ──

function makeRecord(overrides: Partial<V1WorkflowRecord> = {}): V1WorkflowRecord {
  return {
    workflowId: 'wf-1',
    versionId: 'ver-1',
    tenantId: 'tenant-1',
    name: 'My Workflow',
    recipeId: 'recipe-1',
    status: 'DRAFT',
    environmentId: 'dev',
    connectionIds: ['conn-1'],
    params: { key: 'value' },
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

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

function validBody(): Record<string, unknown> {
  return {
    name: 'Test Workflow',
    recipeId: 'recipe-1',
    params: { foo: 'bar' },
    environmentId: 'production',
    connectionIds: ['conn-1', 'conn-2'],
  };
}

// ── validateCreateBody ──

describe('validateCreateBody', () => {
  it('returns null for valid body', () => {
    expect(validateCreateBody(validBody())).toBeNull();
  });

  it('rejects non-object body', () => {
    expect(validateCreateBody('string')).toBe('Request body must be a JSON object');
    expect(validateCreateBody(null)).toBe('Request body must be a JSON object');
    expect(validateCreateBody([1, 2])).toBe('Request body must be a JSON object');
  });

  it('rejects missing name', () => {
    const body = validBody();
    delete body.name;
    expect(validateCreateBody(body)).toContain('name');
  });

  it('rejects empty name', () => {
    expect(validateCreateBody({ ...validBody(), name: '' })).toContain('name');
    expect(validateCreateBody({ ...validBody(), name: '   ' })).toContain('name');
  });

  it('rejects missing recipeId', () => {
    const body = validBody();
    delete body.recipeId;
    expect(validateCreateBody(body)).toContain('recipeId');
  });

  it('rejects empty recipeId', () => {
    expect(validateCreateBody({ ...validBody(), recipeId: '' })).toContain('recipeId');
  });

  it('rejects non-object params', () => {
    expect(validateCreateBody({ ...validBody(), params: 'string' })).toContain('params');
    expect(validateCreateBody({ ...validBody(), params: null })).toContain('params');
    expect(validateCreateBody({ ...validBody(), params: [1] })).toContain('params');
  });

  it('rejects missing environmentId', () => {
    const body = validBody();
    delete body.environmentId;
    expect(validateCreateBody(body)).toContain('environmentId');
  });

  it('rejects empty environmentId', () => {
    expect(validateCreateBody({ ...validBody(), environmentId: '' })).toContain('environmentId');
  });

  it('rejects non-array connectionIds', () => {
    expect(validateCreateBody({ ...validBody(), connectionIds: 'not-array' })).toContain('connectionIds');
  });

  it('rejects connectionIds with non-string elements', () => {
    expect(validateCreateBody({ ...validBody(), connectionIds: [1, 2] })).toContain('connectionIds');
  });

  it('accepts empty connectionIds array', () => {
    expect(validateCreateBody({ ...validBody(), connectionIds: [] })).toBeNull();
  });

  it('accepts empty params object', () => {
    expect(validateCreateBody({ ...validBody(), params: {} })).toBeNull();
  });
});

// ── create ──

describe('createV1WorkflowHandler.create', () => {
  it('returns 201 with workflowId, versionId, status on success', async () => {
    const handler = createV1WorkflowHandler(makeRepo());
    const result = await handler.create('tenant-1', validBody());

    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body).toHaveProperty('workflowId');
    expect(body).toHaveProperty('versionId');
    expect(body.status).toBe('DRAFT');
  });

  it('returns 400 for invalid body', async () => {
    const handler = createV1WorkflowHandler(makeRepo());
    const result = await handler.create('tenant-1', { name: '' });

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toHaveProperty('error');
  });

  it('stores the workflow in the repository', async () => {
    const repo = makeRepo();
    const handler = createV1WorkflowHandler(repo);
    const result = await handler.create('tenant-1', validBody());
    const { workflowId } = JSON.parse(result.body);

    const stored = await repo.getById('tenant-1', workflowId);
    expect(stored).not.toBeNull();
    expect(stored!.name).toBe('Test Workflow');
    expect(stored!.tenantId).toBe('tenant-1');
  });

  it('sets Content-Type to application/json', async () => {
    const handler = createV1WorkflowHandler(makeRepo());
    const result = await handler.create('tenant-1', validBody());
    expect(result.headers?.['Content-Type']).toBe('application/json');
  });
});

// ── list ──

describe('createV1WorkflowHandler.list', () => {
  it('returns 200 with all workflows for tenant', async () => {
    const records = [
      makeRecord({ workflowId: 'wf-1' }),
      makeRecord({ workflowId: 'wf-2', name: 'Second' }),
    ];
    const handler = createV1WorkflowHandler(makeRepo(records));
    const result = await handler.list('tenant-1');

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.workflows).toHaveLength(2);
  });

  it('returns empty array when no workflows exist', async () => {
    const handler = createV1WorkflowHandler(makeRepo());
    const result = await handler.list('tenant-1');

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).workflows).toEqual([]);
  });

  it('filters by status', async () => {
    const records = [
      makeRecord({ workflowId: 'wf-1', status: 'DRAFT' }),
      makeRecord({ workflowId: 'wf-2', status: 'PUBLISHED' }),
    ];
    const handler = createV1WorkflowHandler(makeRepo(records));
    const result = await handler.list('tenant-1', { status: 'PUBLISHED' });

    const body = JSON.parse(result.body);
    expect(body.workflows).toHaveLength(1);
    expect(body.workflows[0].workflowId).toBe('wf-2');
  });

  it('filters by environmentId', async () => {
    const records = [
      makeRecord({ workflowId: 'wf-1', environmentId: 'dev' }),
      makeRecord({ workflowId: 'wf-2', environmentId: 'prod' }),
    ];
    const handler = createV1WorkflowHandler(makeRepo(records));
    const result = await handler.list('tenant-1', { environmentId: 'prod' });

    const body = JSON.parse(result.body);
    expect(body.workflows).toHaveLength(1);
    expect(body.workflows[0].workflowId).toBe('wf-2');
  });

  it('filters by both status and environmentId', async () => {
    const records = [
      makeRecord({ workflowId: 'wf-1', status: 'DRAFT', environmentId: 'dev' }),
      makeRecord({ workflowId: 'wf-2', status: 'PUBLISHED', environmentId: 'dev' }),
      makeRecord({ workflowId: 'wf-3', status: 'PUBLISHED', environmentId: 'prod' }),
    ];
    const handler = createV1WorkflowHandler(makeRepo(records));
    const result = await handler.list('tenant-1', { status: 'PUBLISHED', environmentId: 'prod' });

    const body = JSON.parse(result.body);
    expect(body.workflows).toHaveLength(1);
    expect(body.workflows[0].workflowId).toBe('wf-3');
  });

  it('excludes compiledPlan from response', async () => {
    const records = [
      makeRecord({ compiledPlan: { secret: 'hidden' } }),
    ];
    const handler = createV1WorkflowHandler(makeRepo(records));
    const result = await handler.list('tenant-1');

    const body = JSON.parse(result.body);
    expect(body.workflows[0]).not.toHaveProperty('compiledPlan');
  });

  it('does not return workflows from other tenants', async () => {
    const records = [
      makeRecord({ tenantId: 'tenant-1', workflowId: 'wf-1' }),
      makeRecord({ tenantId: 'tenant-2', workflowId: 'wf-2' }),
    ];
    const handler = createV1WorkflowHandler(makeRepo(records));
    const result = await handler.list('tenant-1');

    const body = JSON.parse(result.body);
    expect(body.workflows).toHaveLength(1);
    expect(body.workflows[0].workflowId).toBe('wf-1');
  });
});

// ── getById ──

describe('createV1WorkflowHandler.getById', () => {
  it('returns 200 with workflow detail', async () => {
    const records = [makeRecord()];
    const handler = createV1WorkflowHandler(makeRepo(records));
    const result = await handler.getById('tenant-1', 'wf-1');

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.workflowId).toBe('wf-1');
    expect(body.name).toBe('My Workflow');
  });

  it('returns 404 when workflow not found', async () => {
    const handler = createV1WorkflowHandler(makeRepo());
    const result = await handler.getById('tenant-1', 'nonexistent');

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body)).toEqual({ error: 'Not found' });
  });

  it('returns 404 for wrong tenant', async () => {
    const records = [makeRecord({ tenantId: 'tenant-1' })];
    const handler = createV1WorkflowHandler(makeRepo(records));
    const result = await handler.getById('tenant-2', 'wf-1');

    expect(result.statusCode).toBe(404);
  });

  it('excludes compiledPlan from response', async () => {
    const records = [makeRecord({ compiledPlan: { secret: 'hidden' } })];
    const handler = createV1WorkflowHandler(makeRepo(records));
    const result = await handler.getById('tenant-1', 'wf-1');

    const body = JSON.parse(result.body);
    expect(body).not.toHaveProperty('compiledPlan');
  });
});

// ── publish ──

describe('createV1WorkflowHandler.publish', () => {
  it('returns 200 with updated workflow on success', async () => {
    const records = [makeRecord({ status: 'DRAFT' })];
    const handler = createV1WorkflowHandler(makeRepo(records));
    const result = await handler.publish('tenant-1', 'wf-1');

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.status).toBe('PUBLISHED');
    expect(body.workflowId).toBe('wf-1');
  });

  it('returns 404 when workflow not found', async () => {
    const handler = createV1WorkflowHandler(makeRepo());
    const result = await handler.publish('tenant-1', 'nonexistent');

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body)).toEqual({ error: 'Not found' });
  });

  it('returns 404 for wrong tenant', async () => {
    const records = [makeRecord({ tenantId: 'tenant-1' })];
    const handler = createV1WorkflowHandler(makeRepo(records));
    const result = await handler.publish('tenant-2', 'wf-1');

    expect(result.statusCode).toBe(404);
  });

  it('excludes compiledPlan from publish response', async () => {
    const records = [makeRecord({ compiledPlan: { secret: 'hidden' } })];
    const handler = createV1WorkflowHandler(makeRepo(records));
    const result = await handler.publish('tenant-1', 'wf-1');

    const body = JSON.parse(result.body);
    expect(body).not.toHaveProperty('compiledPlan');
  });
});
