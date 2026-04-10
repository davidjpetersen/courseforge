import { describe, it, expect } from 'vitest';
import { generateOpenApiSpec } from './openapi';

const spec = generateOpenApiSpec();

// ── Top-level fields (Req 15.1) ──

describe('OpenAPI top-level fields', () => {
  it('has openapi version 3.1.0', () => {
    expect(spec.openapi).toBe('3.1.0');
  });

  it('has info.title set to CourseForge Connect API', () => {
    expect((spec.info as Record<string, unknown>).title).toBe('CourseForge Connect API');
  });

  it('has info.version set to 1.0.0', () => {
    expect((spec.info as Record<string, unknown>).version).toBe('1.0.0');
  });
});

// ── Servers (Req 15.2) ──

describe('OpenAPI servers', () => {
  it('contains production server entry', () => {
    expect(spec.servers).toEqual(
      expect.arrayContaining([{ url: '/api/v1', description: 'Production' }]),
    );
  });
});

// ── Security schemes (Req 15.3) ──

describe('OpenAPI securitySchemes', () => {
  const components = spec.components as Record<string, unknown>;
  const schemes = (components.securitySchemes as Record<string, Record<string, unknown>>);

  it('defines ApiKeyAuth', () => {
    expect(schemes.ApiKeyAuth).toBeDefined();
  });

  it('ApiKeyAuth uses http type with bearer scheme', () => {
    expect(schemes.ApiKeyAuth.type).toBe('http');
    expect(schemes.ApiKeyAuth.scheme).toBe('bearer');
  });
});

// ── Paths (Req 15.4) ──

describe('OpenAPI paths', () => {
  const paths = spec.paths as Record<string, Record<string, unknown>>;

  const expectedPaths = [
    '/recipes',
    '/workflows',
    '/workflows/{workflowId}',
    '/workflows/{workflowId}/publish',
    '/events',
    '/runs',
    '/runs/{runId}',
  ];

  it.each(expectedPaths)('includes path %s', (p) => {
    expect(paths[p]).toBeDefined();
  });

  it('/recipes has GET method', () => {
    expect(paths['/recipes'].get).toBeDefined();
  });

  it('/workflows has POST and GET methods', () => {
    expect(paths['/workflows'].post).toBeDefined();
    expect(paths['/workflows'].get).toBeDefined();
  });

  it('/workflows/{workflowId} has GET method', () => {
    expect(paths['/workflows/{workflowId}'].get).toBeDefined();
  });

  it('/workflows/{workflowId}/publish has POST method', () => {
    expect(paths['/workflows/{workflowId}/publish'].post).toBeDefined();
  });

  it('/events has POST method', () => {
    expect(paths['/events'].post).toBeDefined();
  });

  it('/runs has GET method', () => {
    expect(paths['/runs'].get).toBeDefined();
  });

  it('/runs/{runId} has GET method', () => {
    expect(paths['/runs/{runId}'].get).toBeDefined();
  });
});

// ── Error responses on each path (Req 15.4) ──

describe('OpenAPI error responses', () => {
  const paths = spec.paths as Record<string, Record<string, Record<string, unknown>>>;
  const errorCodes = ['400', '401', '403', '429'];

  const operations: [string, string][] = [
    ['/recipes', 'get'],
    ['/workflows', 'post'],
    ['/workflows', 'get'],
    ['/workflows/{workflowId}', 'get'],
    ['/workflows/{workflowId}/publish', 'post'],
    ['/events', 'post'],
    ['/runs', 'get'],
    ['/runs/{runId}', 'get'],
  ];

  it.each(operations)(
    '%s %s defines error responses 400, 401, 403, 429',
    (path, method) => {
      const op = paths[path][method] as Record<string, unknown>;
      const responses = op.responses as Record<string, unknown>;
      for (const code of errorCodes) {
        expect(responses[code], `${method.toUpperCase()} ${path} missing ${code}`).toBeDefined();
      }
    },
  );
});

// ── Component schemas (Req 15.5) ──

describe('OpenAPI component schemas', () => {
  const components = spec.components as Record<string, unknown>;
  const schemas = components.schemas as Record<string, unknown>;

  const expectedSchemas = ['Workflow', 'Run', 'Recipe', 'ApiError'];

  it.each(expectedSchemas)('defines %s schema', (name) => {
    expect(schemas[name]).toBeDefined();
  });
});
