/**
 * Pure logic functions for the Workflow Management API.
 *
 * These are intentionally decoupled from DynamoDB so they can be
 * property-tested with arbitrary inputs.
 */

import { compareSemver } from '../../../packages/utils/src/semver.js';
import type { Connection, StepDefinition } from '../../../packages/utils/src/compile-plan.js';
import type { WorkflowRecord, WorkflowStatus, WorkflowVersionRecord } from './handlers.js';

// ── State Machine ──

const VALID_TRANSITIONS = new Set<string>([
  'DRAFT:PUBLISHED',
  'DRAFT:ARCHIVED',
  'PUBLISHED:PAUSED',
  'PAUSED:PUBLISHED',
  'PAUSED:ARCHIVED',
]);

export function isValidTransition(from: WorkflowStatus, to: WorkflowStatus): boolean {
  return VALID_TRANSITIONS.has(`${from}:${to}`);
}

export function getTransitionError(from: WorkflowStatus, to: WorkflowStatus): string {
  if (from === 'ARCHIVED') {
    return 'Archived workflows cannot be modified';
  }
  if (to === 'PUBLISHED' && from === 'PUBLISHED') {
    return 'Workflow is already published';
  }
  if (to === 'PAUSED') {
    return 'Only published workflows can be paused';
  }
  if (to === 'ARCHIVED') {
    return 'Pause the workflow before archiving';
  }
  return `Cannot transition workflow from ${from} to ${to}`;
}

// ── Filtering ──

export function filterWorkflows(
  workflows: WorkflowRecord[],
  statusFilter?: string,
  envFilter?: string,
): WorkflowRecord[] {
  return workflows.filter((workflow) => {
    if (statusFilter && workflow.status !== statusFilter) {
      return false;
    }
    if (envFilter && workflow.environmentId !== envFilter) {
      return false;
    }
    return true;
  });
}

// ── Step Summary ──

export function summarizeSteps(compiledPlan: StepDefinition[]): string[] {
  return compiledPlan.map((step) => step.name);
}

// ── Version Utilities ──

export interface VersionMetadata {
  versionId: string;
  workflowId: string;
  semver: string;
  createdBy: string;
  createdAt: string;
  recipeId: string;
}

export function sortVersionsDescending(versions: WorkflowVersionRecord[]): WorkflowVersionRecord[] {
  return [...versions].sort((a, b) => compareSemver(b.semver, a.semver));
}

export function toVersionMetadata(version: WorkflowVersionRecord): VersionMetadata {
  return {
    versionId: version.versionId,
    workflowId: version.workflowId,
    semver: version.semver,
    createdBy: version.createdBy,
    createdAt: version.createdAt,
    recipeId: version.recipeId,
  };
}

// ── Request Validation ──

export interface ValidationError {
  message: string;
}

export function validateCreateRequest(body: unknown): ValidationError | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { message: 'Request body must be a JSON object' };
  }
  const record = body as Record<string, unknown>;

  if (typeof record.name !== 'string' || record.name.trim() === '') {
    return { message: 'name is required' };
  }
  if (typeof record.recipeId !== 'string' || record.recipeId.trim() === '') {
    return { message: 'recipeId is required' };
  }
  if (record.environmentId !== 'dev' && record.environmentId !== 'prod') {
    return { message: 'environmentId must be dev or prod' };
  }
  if (!Array.isArray(record.connectionIds) || record.connectionIds.some((id) => typeof id !== 'string')) {
    return { message: 'connectionIds must be an array of strings' };
  }

  return null;
}

// ── Connection Validation ──

export function validateConnections(
  connections: Connection[],
  requestedIds: string[],
): string | null {
  const found = new Map(connections.map((c) => [c.connectionId, c]));

  for (const id of requestedIds) {
    const connection = found.get(id);
    if (!connection) {
      return 'One or more connections were not found';
    }
    if (connection.status !== 'active') {
      return `Connection ${id} is not active`;
    }
  }

  return null;
}
