import { describe, expect, it, vi } from 'vitest';
import {
  createPromoteHandler,
  type APIGatewayProxyEvent,
  type PromoteRepository,
  type WorkflowRecord,
} from './handler';

// ── Helpers ──

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    path: '/api/workflows/wf-1/promote',
    headers: { 'x-tenant-id': 'tenant-1' },
    pathParameters: { workflowId: 'wf-1' },
    queryStringParameters: null,
    body: null,
    ...overrides,
  };
}

function makeWorkflow(overrides: Partial<WorkflowRecord> = {}): WorkflowRecord {
  return {
    workflowId: 'wf-1',
    tenantId: 'tenant-1',
    name: 'Test Workflow',
    environmentId: 'dev',
    status: 'PUBLISHED',
    createdBy: 'user-1',
    ...overrides,
  };
}

function makeMockRepo(workflow: WorkflowRecord | null = makeWorkflow()): PromoteRepository {
  return {
    getWorkflow: vi.fn().mockResolvedValue(workflow),
    getLatestVersion: vi.fn().mockResolvedValue({
      workflowId: 'wf-1',
      version: '1.0.0',
      compiledPlan: { steps: [] },
    }),
    createWorkflow: vi.fn().mockResolvedValue(undefined),
    createVersion: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockAuditClient() {
  return { write: vi.fn().mockResolvedValue(undefined) };
}

// ── Tests ──

describe('createPromoteHandler', () => {
  it('returns 404 when workflow not found', async () => {
    const handler = createPromoteHandler(makeMockRepo(null), makeMockAuditClient());
    const response = await handler(makeEvent());

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.message).toMatch(/not found/i);
  });

  it('returns 400 when workflow is not in dev environment', async () => {
    const handler = createPromoteHandler(
      makeMockRepo(makeWorkflow({ environmentId: 'prod' })),
      makeMockAuditClient(),
    );
    const response = await handler(makeEvent());

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.message).toMatch(/dev/i);
  });

  it('returns 400 when workflow status is not PUBLISHED', async () => {
    const handler = createPromoteHandler(
      makeMockRepo(makeWorkflow({ status: 'DRAFT' })),
      makeMockAuditClient(),
    );
    const response = await handler(makeEvent());

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.message).toMatch(/published/i);
  });

  it('returns 201 with correct response shape on successful promotion', async () => {
    const repo = makeMockRepo();
    const auditClient = makeMockAuditClient();
    const handler = createPromoteHandler(repo, auditClient);
    const response = await handler(makeEvent());

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('newWorkflowId');
    expect(typeof body.newWorkflowId).toBe('string');
    expect(body.environmentId).toBe('prod');
    expect(body.status).toBe('DRAFT');
  });
});
