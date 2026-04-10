import { describe, it, expect } from 'vitest';
import {
  createListTemplatesHandler,
  createGetTemplateHandler,
  type TemplateRepository,
  type TenantConnectionProvider,
  type APIGatewayProxyEvent,
} from './handlers';
import type { Template } from '../../models/types';
import {
  ROSTER_OPS_TEMPLATE,
  NOTIFICATIONS_TEMPLATE,
} from '../../data/seed-templates';

// ── Helpers ──

function makeRepo(templates: Template[]): TemplateRepository {
  return {
    listAll: async () => templates,
    getById: async (id) => templates.find((t) => t.templateId === id) ?? null,
  };
}

function makeConnectionProvider(
  connections: string[] = [],
): TenantConnectionProvider {
  return {
    getConfiguredConnections: async () => connections,
  };
}

function makeEvent(
  overrides: Partial<APIGatewayProxyEvent> = {},
): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/templates',
    pathParameters: null,
    queryStringParameters: null,
    headers: null,
    ...overrides,
  };
}

// ── GET /templates ──

describe('GET /templates handler', () => {
  it('returns all templates when no category filter is provided', async () => {
    const handler = createListTemplatesHandler(
      makeRepo([ROSTER_OPS_TEMPLATE, NOTIFICATIONS_TEMPLATE]),
    );
    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.templates).toHaveLength(2);
  });

  it('returns empty catalog when no templates exist', async () => {
    const handler = createListTemplatesHandler(makeRepo([]));
    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.templates).toHaveLength(0);
    expect(body.groupedByCategory).toEqual({});
  });

  it('filters by category when ?category= is provided', async () => {
    const handler = createListTemplatesHandler(
      makeRepo([ROSTER_OPS_TEMPLATE, NOTIFICATIONS_TEMPLATE]),
    );
    const result = await handler(
      makeEvent({
        queryStringParameters: { category: 'Roster Ops' },
      }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.templates).toHaveLength(1);
    expect(body.templates[0].templateId).toBe(ROSTER_OPS_TEMPLATE.templateId);
  });

  it('supports multi-category filter (comma-separated)', async () => {
    const handler = createListTemplatesHandler(
      makeRepo([ROSTER_OPS_TEMPLATE, NOTIFICATIONS_TEMPLATE]),
    );
    const result = await handler(
      makeEvent({
        queryStringParameters: { category: 'Roster Ops,Notifications' },
      }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.templates).toHaveLength(2);
  });

  it('groups multi-category templates under each category', async () => {
    const multiCatTemplate: Template = {
      ...ROSTER_OPS_TEMPLATE,
      templateId: 'tpl-multi',
      categories: ['Roster Ops', 'Analytics'],
    };
    const handler = createListTemplatesHandler(makeRepo([multiCatTemplate]));
    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.groupedByCategory['Roster Ops']).toHaveLength(1);
    expect(body.groupedByCategory['Analytics']).toHaveLength(1);
  });

  it('returns 500 when repository throws', async () => {
    const repo: TemplateRepository = {
      listAll: async () => { throw new Error('DB down'); },
      getById: async () => null,
    };
    const handler = createListTemplatesHandler(repo);
    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(500);
  });
});

// ── GET /templates/{templateId} ──

describe('GET /templates/{templateId} handler', () => {
  it('returns template detail with stepCount and missingConnections', async () => {
    const handler = createGetTemplateHandler(
      makeRepo([ROSTER_OPS_TEMPLATE]),
      makeConnectionProvider(['Canvas LMS']),
    );
    const result = await handler(
      makeEvent({
        pathParameters: { templateId: ROSTER_OPS_TEMPLATE.templateId },
      }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.templateId).toBe(ROSTER_OPS_TEMPLATE.templateId);
    expect(body.stepCount).toBe(ROSTER_OPS_TEMPLATE.steps.length);
    // PowerSchool SIS is missing, Canvas LMS is configured
    expect(body.missingConnections).toEqual(['PowerSchool SIS']);
  });

  it('returns 404 when template does not exist', async () => {
    const handler = createGetTemplateHandler(
      makeRepo([]),
      makeConnectionProvider(),
    );
    const result = await handler(
      makeEvent({ pathParameters: { templateId: 'nonexistent' } }),
    );

    expect(result.statusCode).toBe(404);
    const body = JSON.parse(result.body);
    expect(body.message).toBe('Template not found');
  });

  it('returns 400 when templateId path parameter is missing', async () => {
    const handler = createGetTemplateHandler(
      makeRepo([ROSTER_OPS_TEMPLATE]),
      makeConnectionProvider(),
    );
    const result = await handler(makeEvent({ pathParameters: null }));

    expect(result.statusCode).toBe(400);
  });

  it('returns no missing connections when all are configured', async () => {
    const handler = createGetTemplateHandler(
      makeRepo([ROSTER_OPS_TEMPLATE]),
      makeConnectionProvider(['PowerSchool SIS', 'Canvas LMS']),
    );
    const result = await handler(
      makeEvent({
        pathParameters: { templateId: ROSTER_OPS_TEMPLATE.templateId },
      }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.missingConnections).toEqual([]);
  });

  it('returns all connections as missing when tenant has none', async () => {
    const handler = createGetTemplateHandler(
      makeRepo([ROSTER_OPS_TEMPLATE]),
      makeConnectionProvider([]),
    );
    const result = await handler(
      makeEvent({
        pathParameters: { templateId: ROSTER_OPS_TEMPLATE.templateId },
      }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.missingConnections).toEqual(['PowerSchool SIS', 'Canvas LMS']);
  });

  it('returns 500 when repository throws', async () => {
    const repo: TemplateRepository = {
      listAll: async () => [],
      getById: async () => { throw new Error('DB down'); },
    };
    const handler = createGetTemplateHandler(repo, makeConnectionProvider());
    const result = await handler(
      makeEvent({ pathParameters: { templateId: 'any' } }),
    );

    expect(result.statusCode).toBe(500);
  });
});
