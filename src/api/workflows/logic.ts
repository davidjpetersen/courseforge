import { compareSemver } from '../../../packages/utils/src/semver.js';
import type { StepDefinition } from '../../../packages/utils/src/compile-plan.js';
import type { WorkflowRecord, WorkflowVersionRecord, WorkflowStatus } from './handlers.js';

// ── Types ──────────────────────────────────────────────────────────────

export interface ValidationError {
  field: string;
  message: string;
}

export interface VersionMetadata {
  versionId: string;
  workflowId: string;
  semver: string;
  createdBy: string;
  createdAt: string;
  recipeId: string;
}

// ── Filtering ──────────────────────────────────────────────────────────

export function filterWorkflows(
  workflows: WorkflowRecord[],
  statusFilter?: string,
  envFilter?: string,
): WorkflowRecord[] {
  return workflows.filter((w) => {
    if (statusFilter && w.status !== statusFilter) return false;
    if (envFilter && w.environmentId !== envFilter) return false;
    return true;
  });
}

// ── State Machine ──────────────────────────────────────────────────────

const VALID_TRANSITIONS: ReadonlySet<string> = new Set([
  'DRAFT->PUBLISHED',
  'DRAFT->ARCHIVED',
  'PUBLISHED->PAUSED',
  'PAUSED->PUBLISHED',
  'PAUSED->ARCHIVED',
]);

export function isValidTransition(from: WorkflowStatus, to: WorkflowStatus): boolean {
  return VALID_TRANSITIONS.has(`${from}->${to}`);
}

export function getTransitionError(from: WorkflowStatus, to: WorkflowStatus): string {
  if (from === to) {
    return `Workflow is already ${from.toLowerCase()}`;
  }
  if (from === 'ARCHIVED') {
    return 'Archived workflows cannot change status';
  }
  if (to === 'PUBLISHED' && from !== 'DRAFT' && from !== 'PAUSED') {
    return `Cannot publish a workflow in ${from} status`;
  }
  if (to === 'PAUSED' && from !== 'PUBLISHED') {
    return 'Only published workflows can be paused';
  }
  if (to === 'ARCHIVED' && from === 'PUBLISHED') {
    return 'Pause the workflow before archiving';
  }
  return `Cannot transition from ${from} to ${to}`;
}

// ── Step Summary ───────────────────────────────────────────────────────

export function summarizeSteps(compiledPlan: StepDefinition[]): string[] {
  return compiledPlan.map((step) => step.name);
}

// ── Version Utilities ──────────────────────────────────────────────────

export function sortVersionsDescending(
  versions: WorkflowVersionRecord[],
): WorkflowVersionRecord[] {
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

// ── Request Validation ─────────────────────────────────────────────────

export function validateCreateRequest(body: unknown): ValidationError[] | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return [{ field: 'body', message: 'Request body must be a JSON object' }];
  }

  const record = body as Record<string, unknown>;
  const errors: ValidationError[] = [];

  if (typeof record.name !== 'string' || record.name.trim() === '') {
    errors.push({ field: 'name', message: 'name is required' });
  }
  if (typeof record.recipeId !== 'string' || record.recipeId.trim() === '') {
    errors.push({ field: 'recipeId', message: 'recipeId is required' });
  }
  if (record.environmentId !== 'dev' && record.environmentId !== 'prod') {
    errors.push({ field: 'environmentId', message: 'environmentId must be dev or prod' });
  }
  if (
    !Array.isArray(record.connectionIds) ||
    record.connectionIds.some((id) => typeof id !== 'string')
  ) {
    errors.push({ field: 'connectionIds', message: 'connectionIds must be an array of strings' });
  }

  return errors.length > 0 ? errors : null;
}

// ── Connection Validation ──────────────────────────────────────────────

export interface ConnectionInfo {
  connectionId: string;
  status: string;
}

export function validateConnections(
  connections: ConnectionInfo[],
  requestedIds: string[],
): string | null {
  const connectionMap = new Map(connections.map((c) => [c.connectionId, c]));

  for (const id of requestedIds) {
    const connection = connectionMap.get(id);
    if (!connection) {
      return 'One or more connections were not found';
    }
    if (connection.status !== 'active') {
      return `Connection ${id} is not active`;
    }
  }

  return null;
}
