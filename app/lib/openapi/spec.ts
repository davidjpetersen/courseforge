export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'CourseForge Connect API',
    version: '1.0.0',
  },
  servers: [
    {
      url: '/api/v1',
      description: 'Production',
    },
  ],
  security: [{ ApiKeyAuth: [] }],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'http',
        scheme: 'bearer',
      },
    },
    schemas: {
      ApiError: {
        type: 'object',
        required: ['error'],
        properties: {
          error: { type: 'string' },
          retryAfter: { type: 'number' },
        },
      },
      Recipe: {
        type: 'object',
        required: ['id', 'name', 'description', 'category', 'standards', 'estimatedMinutes'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          category: { type: 'string' },
          standards: { type: 'array', items: { type: 'string' } },
          estimatedMinutes: { type: 'number' },
        },
      },
      Workflow: {
        type: 'object',
        required: ['workflowId', 'name', 'status'],
        properties: {
          workflowId: { type: 'string' },
          versionId: { type: 'string' },
          name: { type: 'string' },
          status: { type: 'string', enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] },
          recipeId: { type: 'string' },
          environmentId: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Run: {
        type: 'object',
        required: ['runId', 'workflowId', 'status', 'createdAt'],
        properties: {
          runId: { type: 'string' },
          workflowId: { type: 'string' },
          status: { type: 'string', enum: ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED'] },
          traceId: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          stepSummary: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                stepId: { type: 'string' },
                status: { type: 'string' },
                durationMs: { type: 'number' },
              },
            },
          },
        },
      },
    },
  },
  paths: {
    '/recipes': {
      get: {
        summary: 'List recipes',
        description: 'Returns the list of recipe metadata for workflow creation.',
        responses: {
          200: {
            description: 'Recipe list',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Recipe' } },
              },
            },
          },
          401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          429: { description: 'Rate limited', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
    '/workflows': {
      get: {
        summary: 'List workflows',
        description: 'Returns workflows for the authenticated tenant.',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'environmentId', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Workflow list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Workflow' } } } } },
          401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          429: { description: 'Rate limited', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
      post: {
        summary: 'Create workflow',
        description: 'Creates a workflow from a recipe with tenant-scoped connections.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'recipeId', 'params', 'environmentId', 'connectionIds'],
                properties: {
                  name: { type: 'string' },
                  recipeId: { type: 'string' },
                  params: { type: 'object', additionalProperties: true },
                  environmentId: { type: 'string' },
                  connectionIds: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Workflow' } } } },
          400: { description: 'Bad request', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          429: { description: 'Rate limited', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
    '/workflows/{workflowId}': {
      get: {
        summary: 'Get workflow detail',
        description: 'Returns workflow detail without compiled secrets.',
        parameters: [{ name: 'workflowId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Workflow detail', content: { 'application/json': { schema: { $ref: '#/components/schemas/Workflow' } } } },
          401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          429: { description: 'Rate limited', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
    '/workflows/{workflowId}/publish': {
      post: {
        summary: 'Publish workflow',
        description: 'Publishes a draft workflow version.',
        parameters: [{ name: 'workflowId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Published', content: { 'application/json': { schema: { $ref: '#/components/schemas/Workflow' } } } },
          401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          429: { description: 'Rate limited', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
    '/events': {
      post: {
        summary: 'Trigger event',
        description: 'Triggers a published workflow with an authenticated domain event payload.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['workflowId', 'payload'],
                properties: {
                  workflowId: { type: 'string' },
                  payload: { type: 'object', additionalProperties: true },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Run created', content: { 'application/json': { schema: { type: 'object', required: ['runId', 'traceId'], properties: { runId: { type: 'string' }, traceId: { type: 'string' } } } } } },
          400: { description: 'Bad request', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          403: { description: 'Forbidden', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          429: { description: 'Rate limited', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
    '/runs': {
      get: {
        summary: 'List runs',
        description: 'Returns workflow run summaries for the tenant.',
        parameters: [
          { name: 'workflowId', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'number', default: 50 } },
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Run list', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Run' } } } } },
          401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          429: { description: 'Rate limited', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
    '/runs/{runId}': {
      get: {
        summary: 'Get run detail',
        description: 'Returns run detail with step summary and redacted payload fields.',
        parameters: [{ name: 'runId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Run detail', content: { 'application/json': { schema: { $ref: '#/components/schemas/Run' } } } },
          401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          429: { description: 'Rate limited', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
        },
      },
    },
  },
} as const;

export type OpenApiSpec = typeof openApiSpec;
