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
export type StateName = 'ValidateConfig' | 'GenerateDSL' | 'CreateWorkflowRecord' | 'ActivatePipeline' | 'EmitEvent';
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
export declare const PUBLISH_STATE_MACHINE_NAME = "RecipeLibrary-PublishPipeline";
export declare const PUBLISH_STATE_MACHINE: StateMachineDefinition;
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
export interface PublishPipelineResult {
    workflow: Workflow;
    dsl: WorkflowDSL;
}
/**
 * Executes the publish pipeline steps in sequence.
 * This mirrors the Step Functions state machine logic for local/Lambda execution.
 */
export declare function executePublishPipeline(request: PublishRequest, deps: {
    validator: ConfigValidator;
    dslGenerator: DSLGenerator;
    recordCreator: WorkflowRecordCreator;
    activator: PipelineActivator;
    emitter: EventEmitter;
}): Promise<PublishPipelineResult>;
/**
 * Returns the ordered list of state names in the pipeline.
 */
export declare function getPipelineStates(): StateName[];
/**
 * Returns the state machine definition (for deployment tooling).
 */
export declare function getStateMachineDefinition(): StateMachineDefinition;
//# sourceMappingURL=publish-state-machine.d.ts.map