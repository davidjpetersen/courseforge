import { describe, expect, it, vi } from 'vitest';
import {
  createListEnvironmentsHandler,
  createListWorkflowsByEnvHandler,
  type APIGatewayProxyEvent,
  type EnvironmentRepository,
  type WorkflowRepository,
} from './handler';

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/api/environments',
    headers: { 'x-tenant-id': 'tenant-1' },
    pathParameters: null,
    queryStringParameters: null,
    body: null,
    ...overrides,
  };
}

function makeMockEnvRepo(): EnvironmentRepository {
  return {
    listByTenant: vi.fn().mockResolvedValue([
      {
        environmentId: 'dev',
        tenantId: 'tenant-1',
        name: 'Development',
        description: 'Dev environment',
        isDefault: true,
        createdAt: '2024-01-01T00:00:00Z',
      },
      {
        environmentId: 'prod',
        tenantId: 'tenant-1',
        name: 'Production',
        description: 'Prod environment',
        isDefault: false,
        createdAt: '2024-01-01T00:00:00Z',
      },
    ]),
    countByTenant: vi.fn().mockResolvedValue(2),
  };
}

function makeMockWfRepo(): WorkflowRepository {
  return {
    countByEnvironment: vi.fn().mockResolvedValue(3),
    listByEnvironment: vi.fn().mockResolvedValue([
      { workflowId: 'wf-1', name: 'Workflow 1', status: 'active', environmentId: 'dev' },
    ]),
  };
}

describe('createListEnvironmentsHandler', () => {
  it('returns 400 when x-tenant-id header is missing', async () => {
    const handler = createListEnvironmentsHandler(makeMockEnvRepo(), makeMockWfRepo());
    const response = await handler(makeEvent({ headers: {} }));

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.message).toMatch(/x-tenant-id/i);
  });

  it('returns 200 with environments array including workflowCount', async () => {
    const handler = createListEnvironmentsHandler(makeMockEnvRepo(), makeMockWfRepo());
    const response = await handler(makeEvent());

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.environments).toHaveLength(2);
    expect(body.environments[0]).toHaveProperty('workflowCount', 3);
    expect(body.environments[1]).toHaveProperty('workflowCount', 3);
    expect(body.environments[0].environmentId).toBe('dev');
    expect(body.environments[1].environmentId).toBe('prod');
  });
});

describe('createListWorkflowsByEnvHandler', () => {
  it('returns 400 when x-tenant-id header is missing', async () => {
    const handler = createListWorkflowsByEnvHandler(makeMockWfRepo());
    const response = await handler(makeEvent({ headers: {}, pathParameters: { environmentId: 'dev' } }));

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.message).toMatch(/x-tenant-id/i);
  });

  it('returns 400 for invalid environmentId', async () => {
    const handler = createListWorkflowsByEnvHandler(makeMockWfRepo());
    const response = await handler(makeEvent({ pathParameters: { environmentId: 'staging' } }));

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.message).toMatch(/dev.*prod/i);
  });

  it('returns 200 with workflows array and environmentId for valid request', async () => {
    const handler = createListWorkflowsByEnvHandler(makeMockWfRepo());
    const response = await handler(makeEvent({ pathParameters: { environmentId: 'dev' } }));

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.environmentId).toBe('dev');
    expect(Array.isArray(body.workflows)).toBe(true);
    expect(body.workflows).toHaveLength(1);
    expect(body.workflows[0].workflowId).toBe('wf-1');
  });
});
