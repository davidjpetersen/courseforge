/**
 * Step Functions State Machine Definition — Publish Pipeline.
 *
 * Defines the state machine configuration for the workflow publish pipeline:
 *   1. ValidateConfig — validate the wizard configuration
 *   2. GenerateDSL — serialize config to WorkflowDSL
 *   3. CreateWorkflowRecord — write Workflow to DynamoDB
 *   4. ActivatePipeline — start the workflow execution
 *   5. EmitEvent — publish to EventBridge
 *
 * This module exports the ASL (Amazon States Language) definition as a
 * TypeScript object, plus helper types and a pipeline executor for use
 * in Lambda-based orchestration.
 */

import type { Workflow, WorkflowDSL } from '../models/types.js';
import type { PublishRequest } from '../api/publish/handler.js';

// ── State Machine Types ──

export type StateName =
  | 'ValidateConfig'
  | 'GenerateDSL'
  | 'CreateWorkflowRecord'
  | 'ActivatePipeline'
  | 'EmitEvent';

export interface StateDefinition {
  Type: 'Task' | 'Pass' | 'Fail' | 'Succeed';
  Resource?: string;
  Next?: StateName | 'Success';
  End?: boolean;
  Retry?: Array<{
    ErrorEquals: string[];
    IntervalSeconds: number;
    MaxAttempts: number;
    BackoffRate: number;
  }>;
  Catch?: Array<{
    ErrorEquals: string[];
    Next: string;
  }>;
  Comment?: string;
}

export interface StateMachineDefinition {
  Comment: string;
  StartAt: StateName;
  States: Record<string, StateDefinition>;
}

// ── ASL Definition ──

export const PUBLISH_STATE_MACHINE_NAME = 'RecipeLibrary-PublishPipeline';

export const PUBLISH_STATE_MACHINE: StateMachineDefinition = {
  Comment:
    'Publish pipeline: validate config, generate DSL, create workflow record, activate, emit event.',
  StartAt: 'ValidateConfig',
  States: {
    ValidateConfig: {
      Type: 'Task',
      Resource: 'arn:aws:lambda:REGION:ACCOUNT:function:ValidateConfig',
      Next: 'GenerateDSL',
      Comment: 'Validate the wizard configuration against the template schema.',
      Retry: [
        {
          ErrorEquals: ['States.TaskFailed'],
          IntervalSeconds: 2,
          MaxAttempts: 1,
          BackoffRate: 2,
        },
      ],
      Catch: [
        {
          ErrorEquals: ['States.ALL'],
          Next: 'PublishFailed',
        },
      ],
    },
    GenerateDSL: {
      Type: 'Task',
      Resource: 'arn:aws:lambda:REGION:ACCOUNT:function:GenerateDSL',
      Next: 'CreateWorkflowRecord',
      Comment: 'Serialize the validated configuration into WorkflowDSL.',
      Catch: [
        {
          ErrorEquals: ['States.ALL'],
          Next: 'PublishFailed',
        },
      ],
    },
    CreateWorkflowRecord: {
      Type: 'Task',
      Resource: 'arn:aws:lambda:REGION:ACCOUNT:function:CreateWorkflowRecord',
      Next: 'ActivatePipeline',
      Comment: 'Write the Workflow record to DynamoDB.',
      Retry: [
        {
          ErrorEquals: ['States.TaskFailed'],
          IntervalSeconds: 2,
          MaxAttempts: 2,
          BackoffRate: 2,
        },
      ],
      Catch: [
        {
          ErrorEquals: ['States.ALL'],
          Next: 'PublishFailed',
        },
      ],
    },
    ActivatePipeline: {
      Type: 'Task',
      Resource: 'arn:aws:lambda:REGION:ACCOUNT:function:ActivatePipeline',
      Next: 'EmitEvent',
      Comment: 'Start the workflow execution in the orchestration layer.',
      Catch: [
        {
          ErrorEquals: ['States.ALL'],
          Next: 'PublishFailed',
        },
      ],
    },
    EmitEvent: {
      Type: 'Task',
      Resource: 'arn:aws:lambda:REGION:ACCOUNT:function:EmitEvent',
      Next: 'Success',
      Comment: 'Publish workflow-activated event to EventBridge.',
      Catch: [
        {
          ErrorEquals: ['States.ALL'],
          Next: 'PublishFailed',
        },
      ],
    },
    Success: {
      Type: 'Succeed',
    },
    PublishFailed: {
      Type: 'Fail',
    },
  },
};

// ── Pipeline Step Interfaces ──

export interface ConfigValidator {
  validate(request: PublishRequest): Promise<void>;
}

export interface DSLGenerator {
  generate(request: PublishRequest): Promise<WorkflowDSL>;
}

export interface WorkflowRecordCreator {
  create(request: PublishRequest, dsl: WorkflowDSL): Promise<Workflow>;
}

export interface PipelineActivator {
  activate(workflow: Workflow): Promise<void>;
}

export interface EventEmitter {
  emit(event: {
    source: string;
    detailType: string;
    detail: Record<string, unknown>;
  }): Promise<void>;
}

// ── Pipeline Executor ──

export interface PublishPipelineResult {
  workflow: Workflow;
  dsl: WorkflowDSL;
}

/**
 * Executes the publish pipeline steps in sequence.
 * This mirrors the Step Functions state machine logic for local/Lambda execution.
 */
export async function executePublishPipeline(
  request: PublishRequest,
  deps: {
    validator: ConfigValidator;
    dslGenerator: DSLGenerator;
    recordCreator: WorkflowRecordCreator;
    activator: PipelineActivator;
    emitter: EventEmitter;
  },
): Promise<PublishPipelineResult> {
  // 1. ValidateConfig
  await deps.validator.validate(request);

  // 2. GenerateDSL
  const dsl = await deps.dslGenerator.generate(request);

  // 3. CreateWorkflowRecord
  const workflow = await deps.recordCreator.create(request, dsl);

  // 4. ActivatePipeline
  await deps.activator.activate(workflow);

  // 5. EmitEvent
  await deps.emitter.emit({
    source: 'recipe-library',
    detailType: 'WorkflowPublished',
    detail: {
      workflowId: workflow.workflowId,
      tenantId: workflow.tenantId,
      templateId: workflow.templateId,
      name: workflow.name,
      status: workflow.status,
    },
  });

  return { workflow, dsl };
}

/**
 * Returns the ordered list of state names in the pipeline.
 */
export function getPipelineStates(): StateName[] {
  return [
    'ValidateConfig',
    'GenerateDSL',
    'CreateWorkflowRecord',
    'ActivatePipeline',
    'EmitEvent',
  ];
}

/**
 * Returns the state machine definition (for deployment tooling).
 */
export function getStateMachineDefinition(): StateMachineDefinition {
  return PUBLISH_STATE_MACHINE;
}
