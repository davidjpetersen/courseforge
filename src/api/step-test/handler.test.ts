import { describe, it, expect } from 'vitest';
import {
  createStepTestHandler,
  validateStepTestRequest,
  type ConnectedSystemClient,
  type StepTestTemplateProvider,
  type APIGatewayProxyEvent,
  type StepTestResponse,
} from './handler';

// ── Helpers ──

function makeProvider(
  systemMap: Record<string, string | null> = {},
): StepTestTemplateProvider {
  return {
    getConnectedSystemForStep: async (templateId, stepIndex) =>
      systemMap[`${templateId}:${stepIndex}`] ?? null,
  };
}

function makeClient(
  response?: StepTestResponse,
  error?: Error,
): ConnectedSystemClient {
  return {
    dryRun: async () => {
      if (error) throw error;
      return (
        response ?? {
          result: 'pass',
          details: 'All checks passed',
          suggestedFix: null,
        }
      );
    },
  };
}

function makeEvent(
  overrides: Partial<APIGatewayProxyEvent> = {},
): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    path: '/steps/test',
    pathParameters: null,
    queryStringParameters: null,
    headers: null,
    body: null,
    ...overrides,
  };
}

// ── validateStepTestRequest ──

describe('validateStepTestRequest', () => {
  it('accepts a valid request', () => {
    const result = validateStepTestRequest({
      templateId: 'tpl-1',
      stepIndex: 0,
      configuration: { field1: 'value' },
    });
    expect(typeof result).toBe('object');
    expect((result as any).templateId).toBe('tpl-1');
  });

  it('rejects non-object body', () => {
    expect(validateStepTestRequest(null)).toBe(
      'Request body must be a JSON object',
    );
    expect(validateStepTestRequest('string')).toBe(
      'Request body must be a JSON object',
    );
  });

  it('rejects missing templateId', () => {
    const result = validateStepTestRequest({
      stepIndex: 0,
      configuration: {},
    });
    expect(result).toBe(
      'templateId is required and must be a non-empty string',
    );
  });

  it('rejects empty templateId', () => {
    const result = validateStepTestRequest({
      templateId: '  ',
      stepIndex: 0,
      configuration: {},
    });
    expect(result).toBe(
      'templateId is required and must be a non-empty string',
    );
  });

  it('rejects negative stepIndex', () => {
    const result = validateStepTestRequest({
      templateId: 'tpl-1',
      stepIndex: -1,
      configuration: {},
    });
    expect(result).toBe(
      'stepIndex is required and must be a non-negative integer',
    );
  });

  it('rejects non-integer stepIndex', () => {
    const result = validateStepTestRequest({
      templateId: 'tpl-1',
      stepIndex: 1.5,
      configuration: {},
    });
    expect(result).toBe(
      'stepIndex is required and must be a non-negative integer',
    );
  });

  it('rejects array configuration', () => {
    const result = validateStepTestRequest({
      templateId: 'tpl-1',
      stepIndex: 0,
      configuration: [],
    });
    expect(result).toBe('configuration is required and must be an object');
  });
});

// ── POST /steps/{stepId}/test handler ──

describe('POST /steps/{stepId}/test handler', () => {
  it('returns pass result for valid dry-run', async () => {
    const handler = createStepTestHandler(
      makeProvider({ 'tpl-1:0': 'Canvas LMS' }),
      makeClient({
        result: 'pass',
        details: 'Connection verified',
        suggestedFix: null,
      }),
    );

    const result = await handler(
      makeEvent({
        body: JSON.stringify({
          templateId: 'tpl-1',
          stepIndex: 0,
          configuration: { url: 'https://canvas.example.com' },
        }),
      }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.result).toBe('pass');
    expect(body.details).toBe('Connection verified');
    expect(body.suggestedFix).toBeNull();
  });

  it('returns fail result with suggested fix', async () => {
    const handler = createStepTestHandler(
      makeProvider({ 'tpl-1:1': 'PowerSchool SIS' }),
      makeClient({
        result: 'fail',
        details: 'Authentication failed',
        suggestedFix: 'Check your API key in the connection settings',
      }),
    );

    const result = await handler(
      makeEvent({
        body: JSON.stringify({
          templateId: 'tpl-1',
          stepIndex: 1,
          configuration: { apiKey: 'invalid' },
        }),
      }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.result).toBe('fail');
    expect(body.details).toBe('Authentication failed');
    expect(body.suggestedFix).toBe(
      'Check your API key in the connection settings',
    );
  });

  it('returns 400 when body is missing', async () => {
    const handler = createStepTestHandler(
      makeProvider(),
      makeClient(),
    );
    const result = await handler(makeEvent({ body: null }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Request body is required');
  });

  it('returns 400 for invalid JSON', async () => {
    const handler = createStepTestHandler(
      makeProvider(),
      makeClient(),
    );
    const result = await handler(makeEvent({ body: 'not-json' }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe(
      'Invalid JSON in request body',
    );
  });

  it('returns 400 when step has no connected system', async () => {
    const handler = createStepTestHandler(
      makeProvider(), // no systems mapped
      makeClient(),
    );

    const result = await handler(
      makeEvent({
        body: JSON.stringify({
          templateId: 'tpl-1',
          stepIndex: 0,
          configuration: {},
        }),
      }),
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain(
      'does not reference a connected system',
    );
  });

  it('returns 500 when connected system client throws (timeout simulation)', async () => {
    const handler = createStepTestHandler(
      makeProvider({ 'tpl-1:0': 'Canvas LMS' }),
      makeClient(undefined, new Error('Connection timed out')),
    );

    const result = await handler(
      makeEvent({
        body: JSON.stringify({
          templateId: 'tpl-1',
          stepIndex: 0,
          configuration: {},
        }),
      }),
    );

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });

  it('returns 400 for validation errors in request body', async () => {
    const handler = createStepTestHandler(
      makeProvider(),
      makeClient(),
    );

    const result = await handler(
      makeEvent({
        body: JSON.stringify({ templateId: '', stepIndex: 0, configuration: {} }),
      }),
    );

    expect(result.statusCode).toBe(400);
  });
});
