/**
 * Integration Test — Publish pipeline integration.
 *
 * Exercises the full publish pipeline:
 *   submit → verify Step Functions steps → verify DynamoDB record → verify EventBridge event
 *
 * All pipeline dependencies are mocked with in-memory implementations that
 * record calls for verification.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  executePublishPipeline,
  getPipelineStates,
  type ConfigValidator,
  type DSLGenerator,
  type WorkflowRecordCreator,
  type PipelineActivator,
  type EventEmitter,
} from '../infra/publish-state-machine.js';
import type { PublishRequest } from '../api/publish/handler.js';
import type { Workflow, WorkflowDSL } from '../models/types.js';

describe('Publish pipeline integration', () => {
  // ── Shared fixtures ──

  const publishRequest: PublishRequest = {
    templateId: 'tpl-roster-sync-001',
    tenantId: 'tenant-001',
    name: 'Fall 2024 Roster Sync',
    configuration: {
      sisConnection: 'PowerSchool SIS',
      lmsConnection: 'Canvas LMS',
      syncFrequency: 'Daily',
    },
  };

  const mockDSL: WorkflowDSL = {
    version: '1.0',
    templateId: publishRequest.templateId,
    name: publishRequest.name,
    steps: [
      {
        stepIndex: 0,
        action: 'step-0',
        parameters: { sisConnection: 'PowerSchool SIS' },
        connectedSystem: 'PowerSchool SIS',
      },
    ],
    metadata: {
      tenantId: publishRequest.tenantId,
      createdBy: 'user-admin',
      createdAt: '2024-09-01T12:00:00Z',
    },
  };

  const mockWorkflow: Workflow = {
    workflowId: 'wf-pipeline-001',
    tenantId: publishRequest.tenantId,
    templateId: publishRequest.templateId,
    name: publishRequest.name,
    configuration: publishRequest.configuration,
    dslDefinition: JSON.stringify(mockDSL),
    status: 'active',
    createdBy: 'user-admin',
    createdAt: '2024-09-01T12:00:00Z',
    updatedAt: '2024-09-01T12:00:00Z',
  };

  function createMockDeps() {
    const callOrder: string[] = [];

    const validator: ConfigValidator = {
      validate: vi.fn(async () => {
        callOrder.push('ValidateConfig');
      }),
    };

    const dslGenerator: DSLGenerator = {
      generate: vi.fn(async () => {
        callOrder.push('GenerateDSL');
        return mockDSL;
      }),
    };

    const recordCreator: WorkflowRecordCreator = {
      create: vi.fn(async () => {
        callOrder.push('CreateWorkflowRecord');
        return mockWorkflow;
      }),
    };

    const activator: PipelineActivator = {
      activate: vi.fn(async () => {
        callOrder.push('ActivatePipeline');
      }),
    };

    let emittedEvent: { source: string; detailType: string; detail: Record<string, unknown> } | null = null;
    const emitter: EventEmitter = {
      emit: vi.fn(async (event) => {
        callOrder.push('EmitEvent');
        emittedEvent = event;
      }),
    };

    return { validator, dslGenerator, recordCreator, activator, emitter, callOrder, getEmittedEvent: () => emittedEvent };
  }

  it('executes all 5 pipeline steps in order', async () => {
    const deps = createMockDeps();

    await executePublishPipeline(publishRequest, deps);

    // Verify all 5 steps executed in the correct order
    const expectedOrder = getPipelineStates();
    expect(deps.callOrder).toEqual(expectedOrder);
    expect(deps.callOrder).toHaveLength(5);
  });

  it('returns correct workflow and DSL from pipeline', async () => {
    const deps = createMockDeps();

    const result = await executePublishPipeline(publishRequest, deps);

    expect(result.workflow).toEqual(mockWorkflow);
    expect(result.dsl).toEqual(mockDSL);
  });

  it('workflow record has correct template and tenant association', async () => {
    const deps = createMockDeps();

    const result = await executePublishPipeline(publishRequest, deps);

    // Verify template association
    expect(result.workflow.templateId).toBe(publishRequest.templateId);
    expect(result.workflow.templateId).toBe('tpl-roster-sync-001');

    // Verify tenant association
    expect(result.workflow.tenantId).toBe(publishRequest.tenantId);
    expect(result.workflow.tenantId).toBe('tenant-001');

    // Verify the record creator was called with the request and DSL
    expect(deps.recordCreator.create).toHaveBeenCalledWith(publishRequest, mockDSL);
  });

  it('EventBridge event was emitted with correct detail', async () => {
    const deps = createMockDeps();

    await executePublishPipeline(publishRequest, deps);

    expect(deps.emitter.emit).toHaveBeenCalledTimes(1);

    const emittedEvent = deps.getEmittedEvent();
    expect(emittedEvent).not.toBeNull();
    expect(emittedEvent!.source).toBe('recipe-library');
    expect(emittedEvent!.detailType).toBe('WorkflowPublished');
    expect(emittedEvent!.detail).toEqual({
      workflowId: mockWorkflow.workflowId,
      tenantId: mockWorkflow.tenantId,
      templateId: mockWorkflow.templateId,
      name: mockWorkflow.name,
      status: mockWorkflow.status,
    });
  });

  it('validator receives the original publish request', async () => {
    const deps = createMockDeps();

    await executePublishPipeline(publishRequest, deps);

    expect(deps.validator.validate).toHaveBeenCalledWith(publishRequest);
  });

  it('activator receives the created workflow', async () => {
    const deps = createMockDeps();

    await executePublishPipeline(publishRequest, deps);

    expect(deps.activator.activate).toHaveBeenCalledWith(mockWorkflow);
  });
});
