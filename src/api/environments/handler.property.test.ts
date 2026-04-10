import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  createListEnvironmentsHandler,
  createListWorkflowsByEnvHandler,
  type APIGatewayProxyEvent,
  type EnvironmentRepository,
  type WorkflowRepository,
  type WorkflowSummary,
} from './handler';
import type { EnvironmentRecord } from '../../models/types';

// ── Helpers ──

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

// ── Arbitraries ──

const arbTenantId = fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0);

const arbEnvironmentRecord: fc.Arbitrary<EnvironmentRecord> = fc.record({
  environmentId: fc.constantFrom('dev', 'prod'),
  tenantId: arbTenantId,
  name: fc.string({ minLength: 1, maxLength: 30 }),
  description: fc.string({ maxLength: 60 }),
  isDefault: fc.boolean(),
  createdAt: fc.constant('2024-01-01T00:00:00.000Z'),
});

const arbEnvPair = arbTenantId.chain((tenantId) =>
  fc.tuple(
    fc.record({
      environmentId: fc.constant('dev' as const),
      tenantId: fc.constant(tenantId),
      name: fc.constant('Development'),
      description: fc.constant('Dev environment'),
      isDefault: fc.constant(true),
      createdAt: fc.constant('2024-01-01T00:00:00.000Z'),
    }),
    fc.record({
      environmentId: fc.constant('prod' as const),
      tenantId: fc.constant(tenantId),
      name: fc.constant('Production'),
      description: fc.constant('Prod environment'),
      isDefault: fc.constant(false),
      createdAt: fc.constant('2024-01-01T00:00:00.000Z'),
    }),
  ),
);

const arbWorkflowSummary = (envId: 'dev' | 'prod'): fc.Arbitrary<WorkflowSummary> =>
  fc.record({
    workflowId: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 30 }),
    status: fc.constantFrom('active', 'paused', 'failed'),
    environmentId: fc.constant(envId),
  });

// ── Property 2: Environment limit enforcement ──

describe('Feature: env-separation-audit-log, Property 2: Environment limit enforcement', () => {
  /**
   * Validates: Requirements 2.1, 2.2
   *
   * The handler's listByTenant returns at most 2 environments (the repo
   * enforces the limit). For any tenant with exactly 2 Environment_Records,
   * the list environments response should contain exactly 2 entries.
   */
  it('list environments returns at most 2 environments for any tenant', async () => {
    await fc.assert(
      fc.asyncProperty(arbEnvPair, async ([devEnv, prodEnv]) => {
        const envRepo: EnvironmentRepository = {
          listByTenant: async () => [devEnv, prodEnv],
          countByTenant: async () => 2,
        };
        const wfRepo: WorkflowRepository = {
          countByEnvironment: async () => 0,
          listByEnvironment: async () => [],
        };

        const handler = createListEnvironmentsHandler(envRepo, wfRepo);
        const result = await handler(
          makeEvent({ headers: { 'x-tenant-id': devEnv.tenantId } }),
        );

        expect(result.statusCode).toBe(200);
        const body = JSON.parse(result.body);
        expect(body.environments).toHaveLength(2);
        expect(body.environments.length).toBeLessThanOrEqual(2);
      }),
      { numRuns: 100 },
    );
  });
});

// ── Property 3: List environments returns enriched records ──

describe('Feature: env-separation-audit-log, Property 3: List environments returns enriched records', () => {
  /**
   * Validates: Requirements 3.1, 3.2, 3.3
   *
   * For any tenant with environments and workflows, calling the list
   * environments handler should return exactly the tenant's Environment_Records,
   * and each record's workflowCount field should equal the count returned by
   * wfRepo.countByEnvironment.
   */
  it('each returned environment has workflowCount matching the repo count', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbEnvPair,
        fc.nat({ max: 50 }),
        fc.nat({ max: 50 }),
        async ([devEnv, prodEnv], devCount, prodCount) => {
          const envRepo: EnvironmentRepository = {
            listByTenant: async () => [devEnv, prodEnv],
            countByTenant: async () => 2,
          };
          const wfRepo: WorkflowRepository = {
            countByEnvironment: async (_tid: string, envId: string) =>
              envId === 'dev' ? devCount : prodCount,
            listByEnvironment: async () => [],
          };

          const handler = createListEnvironmentsHandler(envRepo, wfRepo);
          const result = await handler(
            makeEvent({ headers: { 'x-tenant-id': devEnv.tenantId } }),
          );

          expect(result.statusCode).toBe(200);
          const body = JSON.parse(result.body);
          expect(body.environments).toHaveLength(2);

          const devResult = body.environments.find(
            (e: Record<string, unknown>) => e.environmentId === 'dev',
          );
          const prodResult = body.environments.find(
            (e: Record<string, unknown>) => e.environmentId === 'prod',
          );

          expect(devResult.workflowCount).toBe(devCount);
          expect(prodResult.workflowCount).toBe(prodCount);

          // All original fields preserved
          expect(devResult.tenantId).toBe(devEnv.tenantId);
          expect(prodResult.tenantId).toBe(prodEnv.tenantId);
          expect(devResult.name).toBe(devEnv.name);
          expect(prodResult.name).toBe(prodEnv.name);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 4: Environment ID validation ──

describe('Feature: env-separation-audit-log, Property 4: Environment ID validation', () => {
  /**
   * Validates: Requirements 4.1, 4.2
   *
   * For any string that is not 'dev' or 'prod', the list-workflows-by-environment
   * handler should return HTTP 400. For 'dev' or 'prod', it should return HTTP 200.
   */
  it('rejects any environmentId that is not dev or prod with 400', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s !== 'dev' && s !== 'prod'),
        async (invalidEnvId) => {
          const wfRepo: WorkflowRepository = {
            countByEnvironment: async () => 0,
            listByEnvironment: async () => [],
          };

          const handler = createListWorkflowsByEnvHandler(wfRepo);
          const result = await handler(
            makeEvent({ pathParameters: { environmentId: invalidEnvId } }),
          );

          expect(result.statusCode).toBe(400);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('accepts dev and prod with 200', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('dev', 'prod'),
        arbTenantId,
        async (envId, tenantId) => {
          const wfRepo: WorkflowRepository = {
            countByEnvironment: async () => 0,
            listByEnvironment: async () => [],
          };

          const handler = createListWorkflowsByEnvHandler(wfRepo);
          const result = await handler(
            makeEvent({
              headers: { 'x-tenant-id': tenantId },
              pathParameters: { environmentId: envId },
            }),
          );

          expect(result.statusCode).toBe(200);
          const body = JSON.parse(result.body);
          expect(body.environmentId).toBe(envId);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 5: Workflow filtering by environment ──

describe('Feature: env-separation-audit-log, Property 5: Workflow filtering by environment', () => {
  /**
   * Validates: Requirements 4.3, 4.4
   *
   * For any tenant with workflows distributed across dev and prod environments,
   * querying workflows for a specific environmentId should return only workflows
   * whose environmentId matches.
   */
  it('returns only workflows matching the requested environmentId', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbTenantId,
        fc.constantFrom<'dev' | 'prod'>('dev', 'prod'),
        fc.array(arbWorkflowSummary('dev'), { minLength: 0, maxLength: 10 }),
        fc.array(arbWorkflowSummary('prod'), { minLength: 0, maxLength: 10 }),
        async (tenantId, queryEnvId, devWorkflows, prodWorkflows) => {
          const allWorkflows = [...devWorkflows, ...prodWorkflows];
          const expectedWorkflows = allWorkflows.filter((w) => w.environmentId === queryEnvId);

          const wfRepo: WorkflowRepository = {
            countByEnvironment: async () => expectedWorkflows.length,
            listByEnvironment: async (_tid: string, envId: string) =>
              allWorkflows.filter((w) => w.environmentId === envId),
          };

          const handler = createListWorkflowsByEnvHandler(wfRepo);
          const result = await handler(
            makeEvent({
              headers: { 'x-tenant-id': tenantId },
              pathParameters: { environmentId: queryEnvId },
            }),
          );

          expect(result.statusCode).toBe(200);
          const body = JSON.parse(result.body);
          expect(body.environmentId).toBe(queryEnvId);
          expect(body.workflows).toHaveLength(expectedWorkflows.length);

          // Every returned workflow must match the queried environmentId
          for (const wf of body.workflows) {
            expect(wf.environmentId).toBe(queryEnvId);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
