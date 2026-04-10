/**
 * Unit tests for the Publish API handler.
 *
 * Covers: publish success, publish failure retry, workflow-template-tenant
 * association, request validation edge cases.
 */

import { describe, it, expect } from 'vitest';
import {
  createPublishHandler,
  validatePublishRequest,
  buildFirstRunUrl,
  type StepFunctionsClient,
  type APIGatewayProxyEvent,
} from './handler';
import type { Workflow } from '../../models/types';

// ── Helpers ──

function makeWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    workflowId: 'wf-001',
    tenantId: 'tenant-abc',
    templateId: 'tpl-roster-sync',
    name: 'My Roster Sync',
    configuration: { field1: 'value1' },
    dslDefinition: '{}',
    status: 'active',
    createdBy: 'user-1',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:00:00Z',
    ...overrides,
  };
}

function makeSfnClient(
  workflow?: Workflow,
  error?: Error,
): StepFunctionsClient {
  return {
    startPublishPipeline: async () => {
      if (error) throw error;
      return workflow ?? makeWorkflow();
    },
  };
}

function makeEvent(
  overrides: Partial<APIGatewayProxyEvent> = {},
): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    path: '/workflows',
    pathParameters: null,
    queryStringParameters: null,
    headers: null,
    body: null,
    ...overrides,
  };
}

const VALID_BODY = JSON.stringify({
  templateId: 'tpl-roster-sync',
  tenantId: 'tenant-abc',
  name: 'My Roster Sync',
  configuration: { field1: 'value1' },
});

// ── validatePublishRequest ──

describe('validatePublishRequest', () => {
  it('accepts a valid request', () => {
    const result = validatePublishRequest({
      templateId: 'tpl-1',
      tenantId: 'tenant-1',
      name: 'Workflow',
      configuration: { key: 'val' },
    });
    expect(typeof result).toBe('object');
    expect((result as any).templateId).toBe('tpl-1');
  });

  it('rejects non-object body', () => {
    expect(validatePublishRequest(null)).toBe('Request body must be a JSON object');
    expect(validatePublishRequest('string')).toBe('Request body must be a JSON object');
    expect(validatePublishRequest([])).toBe('Request body must be a JSON object');
  });

  it('rejects missing templateId', () => {
    const result = validatePublishRequest({
      tenantId: 'tenant-1',
      name: 'Workflow',
      configuration: {},
    });
    expect(result).toBe('templateId is required and must be a non-empty string');
  });

  it('rejects empty templateId', () => {
    const result = validatePublishRequest({
      templateId: '  ',
      tenantId: 'tenant-1',
      name: 'Workflow',
      configuration: {},
    });
    expect(result).toBe('templateId is required and must be a non-empty string');
  });

  it('rejects missing tenantId', () => {
    const result = validatePublishRequest({
      templateId: 'tpl-1',
      name: 'Workflow',
      configuration: {},
    });
    expect(result).toBe('tenantId is required and must be a non-empty string');
  });

  it('rejects missing name', () => {
    const result = validatePublishRequest({
      templateId: 'tpl-1',
      tenantId: 'tenant-1',
      configuration: {},
    });
    expect(result).toBe('name is required and must be a non-empty string');
  });

  it('rejects array configuration', () => {
    const result = validatePublishRequest({
      templateId: 'tpl-1',
      tenantId: 'tenant-1',
      name: 'Workflow',
      configuration: [],
    });
    expect(result).toBe('configuration is required and must be an object');
  });

  it('rejects null configuration', () => {
    const result = validatePublishRequest({
      templateId: 'tpl-1',
      tenantId: 'tenant-1',
      name: 'Workflow',
      configuration: null,
    });
    expect(result).toBe('configuration is required and must be an object');
  });
});

// ── buildFirstRunUrl ──

describe('buildFirstRunUrl', () => {
  it('builds correct monitoring URL', () => {
    const url = buildFirstRunUrl('wf-001', 'tenant-abc');
    expect(url).toBe('/tenants/tenant-abc/workflows/wf-001/runs/latest');
  });
});

// ── POST /workflows handler ──

describe('POST /workflows handler', () => {
  it('returns 200 with workflow details on success', async () => {
    const handler = createPublishHandler(makeSfnClient());
    const result = await handler(makeEvent({ body: VALID_BODY }));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.workflowId).toBe('wf-001');
    expect(body.status).toBe('active');
    expect(body.name).toBe('My Roster Sync');
    expect(body.firstRunUrl).toContain('wf-001');
    expect(body.firstRunUrl).toContain('tenant-abc');
  });

  it('associates workflow with originating template and tenant', async () => {
    const workflow = makeWorkflow({
      templateId: 'tpl-course-lifecycle',
      tenantId: 'tenant-xyz',
      workflowId: 'wf-999',
    });
    const handler = createPublishHandler(makeSfnClient(workflow));

    const result = await handler(
      makeEvent({
        body: JSON.stringify({
          templateId: 'tpl-course-lifecycle',
          tenantId: 'tenant-xyz',
          name: 'Course Lifecycle',
          configuration: {},
        }),
      }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.workflowId).toBe('wf-999');
    expect(body.firstRunUrl).toContain('tenant-xyz');
    expect(body.firstRunUrl).toContain('wf-999');
  });

  it('returns 400 when body is missing', async () => {
    const handler = createPublishHandler(makeSfnClient());
    const result = await handler(makeEvent({ body: null }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Request body is required');
  });

  it('returns 400 for invalid JSON', async () => {
    const handler = createPublishHandler(makeSfnClient());
    const result = await handler(makeEvent({ body: '{not-json' }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid JSON in request body');
  });

  it('returns 400 for validation errors', async () => {
    const handler = createPublishHandler(makeSfnClient());
    const result = await handler(
      makeEvent({
        body: JSON.stringify({ templateId: '', tenantId: 'x', name: 'y', configuration: {} }),
      }),
    );
    expect(result.statusCode).toBe(400);
  });

  it('returns 500 with error message on publish failure (retry scenario)', async () => {
    const handler = createPublishHandler(
      makeSfnClient(undefined, new Error('Step Functions execution failed')),
    );
    const result = await handler(makeEvent({ body: VALID_BODY }));

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.message).toBe('Step Functions execution failed');
  });

  it('returns 500 with generic message for non-Error throws', async () => {
    const client: StepFunctionsClient = {
      startPublishPipeline: async () => {
        throw 'unexpected string error';
      },
    };
    const handler = createPublishHandler(client);
    const result = await handler(makeEvent({ body: VALID_BODY }));

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.message).toBeTruthy();
  });
});
