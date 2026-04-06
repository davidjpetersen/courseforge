/**
 * Pure logic functions for the Workflow Management API.
 *
 * These are intentionally decoupled from DynamoDB so they can be
 * property-tested with arbitrary inputs.
 */
import type { Connection, StepDefinition } from '../../../packages/utils/src/compile-plan.js';
import type { WorkflowRecord, WorkflowStatus, WorkflowVersionRecord } from './handlers.js';
export declare function isValidTransition(from: WorkflowStatus, to: WorkflowStatus): boolean;
export declare function getTransitionError(from: WorkflowStatus, to: WorkflowStatus): string;
export declare function filterWorkflows(workflows: WorkflowRecord[], statusFilter?: string, envFilter?: string): WorkflowRecord[];
export declare function summarizeSteps(compiledPlan: StepDefinition[]): string[];
export interface VersionMetadata {
    versionId: string;
    workflowId: string;
    semver: string;
    createdBy: string;
    createdAt: string;
    recipeId: string;
}
export declare function sortVersionsDescending(versions: WorkflowVersionRecord[]): WorkflowVersionRecord[];
export declare function toVersionMetadata(version: WorkflowVersionRecord): VersionMetadata;
export interface ValidationError {
    message: string;
}
export declare function validateCreateRequest(body: unknown): ValidationError | null;
export declare function validateConnections(connections: Connection[], requestedIds: string[]): string | null;
//# sourceMappingURL=logic.d.ts.map