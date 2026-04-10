import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';

import {
  createPromoteHandler,
  type APIGatewayProxyEvent,
  type PromoteRepository,
  type WorkflowRecord,
  type WorkflowVersionRecord,
} from './handler';
import { ActionType } from '../../../packages/types/src/audit';

// ── Arbitraries ──

const arbId = fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0);

const arbWorkflowRecord = fc.record({
  workflowId: arbId,
  tenantId: arbId,
  name: fc.string({ minLength: 1, maxLength: 60 }),
  environmentId: fc.string({ minLength: 1, maxLength: 20 }),
  status: fc.string({ minLength: 1, maxLength: 20 }),
  createdBy: arbId,
});

/** Workflow that is NOT valid for promotion: either not dev or not PUBLISHED (or both). */
const arbInvalidWorkflow: fc.Arbitrary<WorkflowRecord> = arbWorkflowRecord.filter(
  (w) => w.environmentId !== 'dev' || w.status !== 'PUBLISHED',
);

/** Workflow that IS valid for promotion: dev + PUBLISHED. */
const arbValidWorkflow: fc.Arbitrary<WorkflowRecord> = arbWorkflowRecord.map((w) => ({
  ...w,
  environmentId: 'dev',
  status: 'PUBLISHED',
}));

const arbCompiledPlan: fc.Arbitrary<Record<string, unknown>> = fc.oneof(
  fc.constant({} as Record<string, unknown>),
  fc.record({
    steps: fc.array(fc.record({ id: arbId, type: fc.constantFrom('http', 'transform', 'filter') }), { maxLength: 5 }),
  }) as fc.Arbitrary<Record<string, unknown>>,
);

const arbVersion: fc.Arbitrary<WorkflowVersionRecord> = fc.record({
  workflowId: arbId,
  version: fc.stringMatching(/^[0-9]+\.[0-9]+\.[0-9]+$/),
  compiledPlan: arbCompiledPlan,
});

// ── Helpers ──

function makeEvent(tenantId: string, workflowId: string): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    path: `/api/workflows/${workflowId}/promote`,
    headers: { 'x-tenant-id': tenantId },
    pathParameters: { workflowId },
    queryStringParameters: null,
    body: null,
  };
}

interface CapturedCalls {
  createWorkflowCalls: WorkflowRecord[];
  createVersionCalls: WorkflowVersionRecord[];
}

function makeMockRepo(
  workflow: WorkflowRecord | null,
  version: WorkflowVersionRecord | null,
  captured: CapturedCalls,
): PromoteRepository {
  return {
    getWorkflow: vi.fn().mockResolvedValue(workflow),
    getLatestVersion: vi.fn().mockResolvedValue(version),
    createWorkflow: vi.fn(async (rec: WorkflowRecord) => {
      captured.createWorkflowCalls.push(rec);
    }),
    createVersion: vi.fn(async (rec: WorkflowVersionRecord) => {
      captured.createVersionCalls.push(rec);
    }),
  };
}


// ── Property 6: Promotion rejects invalid workflow state ──

describe('Feature: env-separation-audit-log, Property 6: Promotion rejects invalid workflow state', () => {
  /**
   * Validates: Requirements 5.3, 5.4
   *
   * For any workflow with environmentId other than 'dev' or status other than
   * 'PUBLISHED', the promote handler should return HTTP 400 and no new records
   * should be created (repo.createWorkflow and repo.createVersion should not be called).
   */
  it('returns 400 and creates no records for any non-dev or non-PUBLISHED workflow', async () => {
    await fc.assert(
      fc.asyncProperty(arbInvalidWorkflow, arbVersion, async (workflow, version) => {
        const captured: CapturedCalls = { createWorkflowCalls: [], createVersionCalls: [] };
        const repo = makeMockRepo(workflow, version, captured);
        const auditClient = { write: vi.fn().mockResolvedValue(undefined) };

        const handler = createPromoteHandler(repo, auditClient);
        const event = makeEvent(workflow.tenantId, workflow.workflowId);
        const response = await handler(event);

        // Must reject with 400
        expect(response.statusCode).toBe(400);

        // No new records should be created
        expect(captured.createWorkflowCalls).toHaveLength(0);
        expect(captured.createVersionCalls).toHaveLength(0);

        // Audit should not be written for rejected promotions
        expect(auditClient.write).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });
});

// ── Property 7: Promotion produces correct output ──

describe('Feature: env-separation-audit-log, Property 7: Promotion produces correct output', () => {
  /**
   * Validates: Requirements 5.5, 5.6, 5.7, 5.8
   *
   * For any valid dev/PUBLISHED workflow with a published version, promoting it should:
   * - Create a new WorkflowRecord with a different workflowId, environmentId 'prod', status 'DRAFT'
   * - Create a new WorkflowVersionRecord whose compiledPlan matches the source version's compiledPlan
   * - Write an audit entry with actionType WORKFLOW_PROMOTED and detail containing both
   *   sourceWorkflowId and targetWorkflowId
   * - Return 201
   */
  it('creates correct prod workflow, version, audit entry, and returns 201', async () => {
    await fc.assert(
      fc.asyncProperty(arbValidWorkflow, arbVersion, async (workflow, sourceVersion) => {
        const captured: CapturedCalls = { createWorkflowCalls: [], createVersionCalls: [] };
        const repo = makeMockRepo(workflow, sourceVersion, captured);
        const auditClient = { write: vi.fn().mockResolvedValue(undefined) };

        const handler = createPromoteHandler(repo, auditClient);
        const event = makeEvent(workflow.tenantId, workflow.workflowId);
        const response = await handler(event);

        // Must return 201
        expect(response.statusCode).toBe(201);

        const body = JSON.parse(response.body);

        // Response shape
        expect(body).toHaveProperty('newWorkflowId');
        expect(typeof body.newWorkflowId).toBe('string');
        expect(body.environmentId).toBe('prod');
        expect(body.status).toBe('DRAFT');

        // New workflow record created with correct fields
        expect(captured.createWorkflowCalls).toHaveLength(1);
        const newWf = captured.createWorkflowCalls[0]!;
        expect(newWf.workflowId).toBe(body.newWorkflowId);
        expect(newWf.workflowId).not.toBe(workflow.workflowId); // different ID
        expect(newWf.environmentId).toBe('prod');
        expect(newWf.status).toBe('DRAFT');
        expect(newWf.tenantId).toBe(workflow.tenantId);

        // New version record created with matching compiledPlan
        expect(captured.createVersionCalls).toHaveLength(1);
        const newVer = captured.createVersionCalls[0]!;
        expect(newVer.workflowId).toBe(body.newWorkflowId);
        expect(newVer.compiledPlan).toEqual(sourceVersion.compiledPlan);

        // Audit entry written with correct actionType and detail
        expect(auditClient.write).toHaveBeenCalledOnce();
        const auditArg = auditClient.write.mock.calls[0]![0];
        expect(auditArg.actionType).toBe(ActionType.WORKFLOW_PROMOTED);
        expect(auditArg.detail.sourceWorkflowId).toBe(workflow.workflowId);
        expect(auditArg.detail.targetWorkflowId).toBe(body.newWorkflowId);
      }),
      { numRuns: 100 },
    );
  });
});
