import { describe, expect, it, vi } from 'vitest';
import {
  createConnectionHandler,
  deleteConnectionHandler,
  getDependenciesHandler,
  listConnectionsHandler,
  rotateConnectionHandler,
  testConnectionHandler,
  type APIGatewayProxyEvent,
  type AuditRepository,
  type ConnectionRepository,
  type SecretsService,
  type WorkflowRepository,
} from './handlers';
import type { ConnectionRecord, Workflow } from '../../models/types';
import { connectorRegistry } from './registry';

function mockFetch(ok: boolean, status: number): typeof fetch {
  return vi.fn(async () => ({ ok, status } as unknown as Response)) as unknown as typeof fetch;
}

function makeConnection(overrides: Partial<ConnectionRecord> = {}): ConnectionRecord {
  return {
    connectionId: 'conn-1',
    tenantId: 'tenant-1',
    connectorKey: 'generic-http',
    displayName: 'HTTP',
    authType: 'apikey',
    secretRef: 'arn:secret',
    scopes: [],
    status: 'pending',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    lastTestedAt: null,
    createdBy: 'user-1',
    deletedAt: null,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/connections',
    pathParameters: null,
    queryStringParameters: null,
    headers: null,
    body: null,
    ...overrides,
  };
}

function makeConnectionRepo(
  connection: ConnectionRecord | null = makeConnection(),
): ConnectionRepository {
  return {
    create: vi.fn(async () => undefined),
    getById: vi.fn(async () => connection),
    listByTenant: vi.fn(async () => (connection ? [connection] : [])),
    update: vi.fn(async () => undefined),
    softDelete: vi.fn(async () => undefined),
  };
}

function makeSecretsService(): SecretsService {
  return {
    createSecret: vi.fn(async () => 'arn:secret'),
    getSecretValue: vi.fn(async () => ({ baseUrl: 'https://example.com', apiKey: 'secret' })),
    putSecretValue: vi.fn(async () => undefined),
    scheduleDelete: vi.fn(async () => undefined),
  };
}

function makeWorkflowRepo(workflows: Workflow[] = []): WorkflowRepository {
  return {
    listByTenant: vi.fn(async () => workflows),
  };
}

function makeAuditRepo(): AuditRepository {
  return {
    writeEntry: vi.fn(async () => undefined),
  };
}

describe('connection handlers', () => {
  it('create returns 201 on success', async () => {
    const repo = makeConnectionRepo();
    const secrets = makeSecretsService();
    const handler = createConnectionHandler(repo, secrets, connectorRegistry);

    const result = await handler(
      makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          tenantId: 'tenant-1',
          connectorKey: 'generic-http',
          displayName: 'HTTP',
          authType: 'apikey',
          credentials: { baseUrl: 'https://example.com' },
        }),
      }),
    );

    expect(result.statusCode).toBe(201);
    expect(JSON.parse(result.body).status).toBe('pending');
  });

  it('create returns 400 on unknown connector', async () => {
    const handler = createConnectionHandler(
      makeConnectionRepo(),
      makeSecretsService(),
      connectorRegistry,
    );

    const result = await handler(
      makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          tenantId: 'tenant-1',
          connectorKey: 'nonexistent-connector',
          displayName: 'Unknown',
          authType: 'apikey',
          credentials: { baseUrl: 'https://example.com' },
        }),
      }),
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'connectorKey' }),
      ]),
    );
  });

  it('create returns 400 on bad input', async () => {
    const handler = createConnectionHandler(
      makeConnectionRepo(),
      makeSecretsService(),
      connectorRegistry,
    );

    const result = await handler(
      makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          tenantId: 'tenant-1',
          connectorKey: 'generic-http',
          displayName: 'HTTP',
          authType: 'apikey',
          credentials: {},
        }),
      }),
    );

    expect(result.statusCode).toBe(400);
  });

  it('test-connection returns 200 on success', async () => {
    const repo = makeConnectionRepo();
    const secrets = makeSecretsService();
    globalThis.fetch = mockFetch(true, 200);
    const handler = testConnectionHandler(repo, secrets, connectorRegistry);

    const result = await handler(
      makeEvent({
        httpMethod: 'POST',
        pathParameters: { id: 'conn-1' },
        queryStringParameters: { tenantId: 'tenant-1' },
      }),
    );

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).success).toBe(true);
  });

  it('test-connection returns 404 for missing connection', async () => {
    const handler = testConnectionHandler(
      makeConnectionRepo(null),
      makeSecretsService(),
      connectorRegistry,
    );

    const result = await handler(
      makeEvent({
        httpMethod: 'POST',
        pathParameters: { id: 'conn-1' },
        queryStringParameters: { tenantId: 'tenant-1' },
      }),
    );

    expect(result.statusCode).toBe(404);
  });

  it('list returns mapped items', async () => {
    const handler = listConnectionsHandler(makeConnectionRepo());
    const result = await handler(
      makeEvent({ queryStringParameters: { tenantId: 'tenant-1' } }),
    );

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).connections).toHaveLength(1);
  });

  it('dependencies returns dependent workflows', async () => {
    const handler = getDependenciesHandler(
      makeConnectionRepo(),
      makeWorkflowRepo([
        {
          workflowId: 'wf-1',
          tenantId: 'tenant-1',
          templateId: 'tpl-1',
          name: 'Dependent',
          configuration: { connectionIds: ['conn-1'] },
          dslDefinition: '{}',
          status: 'active',
          createdBy: 'user-1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ]),
    );

    const result = await handler(
      makeEvent({
        pathParameters: { id: 'conn-1' },
        queryStringParameters: { tenantId: 'tenant-1' },
      }),
    );

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).workflows).toHaveLength(1);
  });

  it('dependencies returns empty list when no dependents', async () => {
    const handler = getDependenciesHandler(
      makeConnectionRepo(),
      makeWorkflowRepo([]),
    );

    const result = await handler(
      makeEvent({
        pathParameters: { id: 'conn-1' },
        queryStringParameters: { tenantId: 'tenant-1' },
      }),
    );

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).workflows).toHaveLength(0);
  });

  it('dependencies returns 404 on missing connection', async () => {
    const handler = getDependenciesHandler(
      makeConnectionRepo(null),
      makeWorkflowRepo([]),
    );

    const result = await handler(
      makeEvent({
        pathParameters: { id: 'conn-1' },
        queryStringParameters: { tenantId: 'tenant-1' },
      }),
    );

    expect(result.statusCode).toBe(404);
  });

  it('rotate returns 200 on success', async () => {
    const audit = makeAuditRepo();
    const handler = rotateConnectionHandler(
      makeConnectionRepo(),
      makeSecretsService(),
      connectorRegistry,
      audit,
    );
    globalThis.fetch = mockFetch(true, 200);

    const result = await handler(
      makeEvent({
        httpMethod: 'PUT',
        pathParameters: { id: 'conn-1' },
        body: JSON.stringify({
          tenantId: 'tenant-1',
          credentials: { baseUrl: 'https://example.com', apiKey: 'secret' },
        }),
      }),
    );

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).success).toBe(true);
  });

  it('rotate returns 422 when credentials fail connector test', async () => {
    globalThis.fetch = mockFetch(false, 401);
    const handler = rotateConnectionHandler(
      makeConnectionRepo(),
      makeSecretsService(),
      connectorRegistry,
      makeAuditRepo(),
    );

    const result = await handler(
      makeEvent({
        httpMethod: 'PUT',
        pathParameters: { id: 'conn-1' },
        body: JSON.stringify({
          tenantId: 'tenant-1',
          credentials: { baseUrl: 'https://example.com', apiKey: 'secret' },
        }),
      }),
    );

    expect(result.statusCode).toBe(422);
  });

  it('rotate returns 404 on missing connection', async () => {
    const handler = rotateConnectionHandler(
      makeConnectionRepo(null),
      makeSecretsService(),
      connectorRegistry,
      makeAuditRepo(),
    );

    const result = await handler(
      makeEvent({
        httpMethod: 'PUT',
        pathParameters: { id: 'conn-1' },
        body: JSON.stringify({
          tenantId: 'tenant-1',
          credentials: { baseUrl: 'https://example.com', apiKey: 'secret' },
        }),
      }),
    );

    expect(result.statusCode).toBe(404);
  });

  it('delete returns 204 on success', async () => {
    const handler = deleteConnectionHandler(
      makeConnectionRepo(),
      makeSecretsService(),
      makeWorkflowRepo([]),
      makeAuditRepo(),
    );

    const result = await handler(
      makeEvent({
        httpMethod: 'DELETE',
        pathParameters: { id: 'conn-1' },
        queryStringParameters: { tenantId: 'tenant-1' },
      }),
    );

    expect(result.statusCode).toBe(204);
  });

  it('delete returns 404 on missing connection', async () => {
    const handler = deleteConnectionHandler(
      makeConnectionRepo(null),
      makeSecretsService(),
      makeWorkflowRepo([]),
      makeAuditRepo(),
    );

    const result = await handler(
      makeEvent({
        httpMethod: 'DELETE',
        pathParameters: { id: 'conn-1' },
        queryStringParameters: { tenantId: 'tenant-1' },
      }),
    );

    expect(result.statusCode).toBe(404);
  });

  it('delete returns 409 on published dependents', async () => {
    const handler = deleteConnectionHandler(
      makeConnectionRepo(),
      makeSecretsService(),
      makeWorkflowRepo([
        {
          workflowId: 'wf-1',
          tenantId: 'tenant-1',
          templateId: 'tpl-1',
          name: 'Published',
          configuration: { connectionIds: ['conn-1'] },
          dslDefinition: '{}',
          status: 'active',
          createdBy: 'user-1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ]),
      makeAuditRepo(),
    );

    const result = await handler(
      makeEvent({
        httpMethod: 'DELETE',
        pathParameters: { id: 'conn-1' },
        queryStringParameters: { tenantId: 'tenant-1' },
      }),
    );

    expect(result.statusCode).toBe(409);
  });
});
