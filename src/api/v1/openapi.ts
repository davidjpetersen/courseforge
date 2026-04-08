/**
 * Static OpenAPI 3.1 specification for the CourseForge Connect API.
 *
 * Built at module load time — the route definitions are fixed so there is
 * no need to regenerate per request.
 */

const errorResponses = {
  400: {
    description: 'Bad Request — invalid or missing parameters',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ApiError' },
      },
    },
  },
  401: {
    description: 'Unauthorized — missing or invalid API key',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ApiError' },
      },
    },
  },
  403: {
    description: 'Forbidden — insufficient scope',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ApiError' },
      },
    },
  },
  429: {
    description: 'Too Many Requests — rate limit exceeded',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ApiError' },
        example: { error: 'Rate limit exceeded', retryAfterSeconds: 12 },
      },
    },
  },
} as const;

const securityRequirement = [{ ApiKeyAuth: [] }];

const spec: Record<string, unknown> = {
  openapi: '3.1.0',
  info: {
    title: 'CourseForge Connect API',
    version: '1.0.0',
    description:
      'Programmatic interface for managing workflows, triggering events, querying runs, and browsing recipes in CourseForge Connect.',
  },
  servers: [{ url: '/api/v1', description: 'Production' }],
  security: securityRequirement,
  paths: {
    '/recipes': {
      get: {
        summary: 'List recipes',
        description: 'Returns the catalog of available workflow recipes.',
        operationId: 'listRecipes',
        security: securityRequirement,
        responses: {
          200: {
            description: 'Recipe list',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Recipe' },
                },
              },
            },
          },
          ...errorResponses,
        },
      },
    },
    '/workflows': {
      post: {
        summary: 'Create a workflow',
        description:
          'Creates a new workflow from a recipe with the given parameters.',
        operationId: 'createWorkflow',
        security: securityRequirement,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'recipeId', 'params', 'environmentId', 'connectionIds'],
                properties: {
                  name: { type: 'string', description: 'Workflow name' },
                  recipeId: { type: 'string', description: 'Recipe template ID' },
                  params: {
                    type: 'object',
                    additionalProperties: true,
                    description: 'Recipe parameters',
                  },
                  environmentId: { type: 'string', description: 'Target environment ID' },
                  connectionIds: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Connection IDs to bind',
                  },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Workflow created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    workflowId: { type: 'string' },
                    versionId: { type: 'string' },
                    status: { type: 'string', example: 'DRAFT' },
                  },
                },
              },
            },
          },
          ...errorResponses,
        },
      },
      get: {
        summary: 'List workflows',
        description:
          'Returns workflows for the authenticated tenant with optional filters.',
        operationId: 'listWorkflows',
        security: securityRequirement,
        parameters: [
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string' },
            description: 'Filter by workflow status',
          },
          {
            name: 'environmentId',
            in: 'query',
            schema: { type: 'string' },
            description: 'Filter by environment ID',
          },
        ],
        responses: {
          200: {
            description: 'Workflow list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    workflows: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Workflow' },
                    },
                  },
                },
              },
            },
          },
          ...errorResponses,
        },
      },
    },
    '/workflows/{workflowId}': {
      get: {
        summary: 'Get workflow detail',
        description:
          'Returns a single workflow by ID. Sensitive compiled plan data is excluded.',
        operationId: 'getWorkflow',
        security: securityRequirement,
        parameters: [
          {
            name: 'workflowId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Workflow ID',
          },
        ],
        responses: {
          200: {
            description: 'Workflow detail',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Workflow' },
              },
            },
          },
          ...errorResponses,
        },
      },
    },
    '/workflows/{workflowId}/publish': {
      post: {
        summary: 'Publish a workflow',
        description:
          'Transitions a workflow to PUBLISHED status so it can receive events.',
        operationId: 'publishWorkflow',
        security: securityRequirement,
        parameters: [
          {
            name: 'workflowId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Workflow ID',
          },
        ],
        responses: {
          200: {
            description: 'Workflow published',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Workflow' },
              },
            },
          },
          ...errorResponses,
        },
      },
    },
    '/events': {
      post: {
        summary: 'Trigger an event',
        description:
          'Triggers a workflow run by publishing a domain event. The workflow must be PUBLISHED and belong to the authenticated tenant.',
        operationId: 'triggerEvent',
        security: securityRequirement,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['workflowId', 'payload'],
                properties: {
                  workflowId: { type: 'string', description: 'Target workflow ID' },
                  payload: {
                    type: 'object',
                    additionalProperties: true,
                    description: 'Event payload forwarded to the workflow',
                  },
                },
              },
            },
          },
        },
        responses: {
          202: {
            description: 'Event accepted',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    runId: { type: 'string' },
                    traceId: { type: 'string' },
                  },
                },
              },
            },
          },
          ...errorResponses,
        },
      },
    },
    '/runs': {
      get: {
        summary: 'List runs',
        description:
          'Returns workflow runs for the authenticated tenant with optional filters and cursor-based pagination.',
        operationId: 'listRuns',
        security: securityRequirement,
        parameters: [
          {
            name: 'workflowId',
            in: 'query',
            schema: { type: 'string' },
            description: 'Filter by workflow ID',
          },
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string' },
            description: 'Filter by run status',
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', default: 50 },
            description: 'Maximum number of results (default 50)',
          },
          {
            name: 'cursor',
            in: 'query',
            schema: { type: 'string' },
            description: 'Pagination cursor (runId of last item)',
          },
        ],
        responses: {
          200: {
            description: 'Run list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    runs: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Run' },
                    },
                    cursor: {
                      type: 'string',
                      description: 'Cursor for the next page, absent when no more results',
                    },
                  },
                },
              },
            },
          },
          ...errorResponses,
        },
      },
    },
    '/runs/{runId}': {
      get: {
        summary: 'Get run detail',
        description:
          'Returns a single run by ID including a step summary. Raw payloads are excluded.',
        operationId: 'getRun',
        security: securityRequirement,
        parameters: [
          {
            name: 'runId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Run ID',
          },
        ],
        responses: {
          200: {
            description: 'Run detail',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Run' },
              },
            },
          },
          ...errorResponses,
        },
      },
    },
  },
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
          error: { type: 'string', description: 'Human-readable error message' },
        },
      },
      Recipe: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          category: { type: 'string' },
          standards: { type: 'array', items: { type: 'string' } },
          estimatedMinutes: { type: 'integer' },
        },
      },
      Workflow: {
        type: 'object',
        properties: {
          workflowId: { type: 'string' },
          versionId: { type: 'string' },
          tenantId: { type: 'string' },
          name: { type: 'string' },
          recipeId: { type: 'string' },
          status: { type: 'string', example: 'DRAFT' },
          environmentId: { type: 'string' },
          connectionIds: { type: 'array', items: { type: 'string' } },
          params: { type: 'object', additionalProperties: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Run: {
        type: 'object',
        properties: {
          runId: { type: 'string' },
          tenantId: { type: 'string' },
          workflowId: { type: 'string' },
          status: { type: 'string', example: 'PENDING' },
          triggerType: { type: 'string', example: 'api' },
          traceId: { type: 'string' },
          startedAt: { type: 'string', format: 'date-time' },
          completedAt: { type: ['string', 'null'], format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
          steps: {
            type: 'array',
            description: 'Step summary (only present in detail responses)',
            items: {
              type: 'object',
              properties: {
                stepId: { type: 'string' },
                stepIndex: { type: 'integer' },
                status: { type: 'string' },
                startedAt: { type: 'string', format: 'date-time' },
                completedAt: { type: ['string', 'null'], format: 'date-time' },
              },
            },
          },
        },
      },
    },
  },
};

/**
 * Returns the static OpenAPI 3.1 specification as a plain JavaScript object.
 */
export function generateOpenApiSpec(): Record<string, unknown> {
  return spec;
}
