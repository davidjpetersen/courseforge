import { randomUUID } from 'node:crypto';

import {
  makeApiKeyRecord,
  type ApiKeyRecord,
  type ApiKeyScope,
  type ApiKeyStore,
} from '../../middleware/api-key-auth.js';

export interface WorkflowRecord {
  workflowId: string;
  tenantId: string;
  name: string;
  recipeId: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  environmentId: string;
  versionId: string;
  params: Record<string, unknown>;
  connectionIds: string[];
  createdAt: string;
}

export interface RunRecord {
  runId: string;
  tenantId: string;
  workflowId: string;
  traceId: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  createdAt: string;
  stepSummary: Array<{ stepId: string; status: string; durationMs?: number }>;
}

export interface RecipeRecord {
  id: string;
  name: string;
  description: string;
  category: string;
  standards: string[];
  estimatedMinutes: number;
}

export interface ConnectDataStore extends ApiKeyStore {
  listRecipes(): Promise<RecipeRecord[]>;
  createWorkflow(input: Omit<WorkflowRecord, 'workflowId' | 'versionId' | 'status' | 'createdAt'>): Promise<WorkflowRecord>;
  listWorkflows(tenantId: string, filters: { status?: string; environmentId?: string }): Promise<WorkflowRecord[]>;
  getWorkflow(tenantId: string, workflowId: string): Promise<WorkflowRecord | undefined>;
  publishWorkflow(tenantId: string, workflowId: string): Promise<WorkflowRecord | undefined>;
  createRun(input: Omit<RunRecord, 'runId' | 'traceId' | 'status' | 'createdAt' | 'stepSummary'>): Promise<RunRecord>;
  listRuns(tenantId: string, filters: { workflowId?: string; status?: string; limit?: number }): Promise<RunRecord[]>;
  getRun(tenantId: string, runId: string): Promise<RunRecord | undefined>;
}

export async function createApiKey(input: {
  store: ConnectDataStore;
  tenantId: string;
  name: string;
  scope: ApiKeyScope;
  createdBy: string;
}) {
  const { key, record } = makeApiKeyRecord(input);
  await input.store.create(record);
  return {
    keyId: record.keyId,
    key,
    scope: record.scope,
    name: record.name,
  };
}

export function redactApiKey(record: ApiKeyRecord) {
  const { hashedKey: _hashedKey, ...safe } = record;
  return safe;
}

export class InMemoryConnectDataStore implements ConnectDataStore {
  private readonly keys = new Map<string, ApiKeyRecord>();
  private readonly workflows = new Map<string, WorkflowRecord>();
  private readonly runs = new Map<string, RunRecord>();

  async create(record: ApiKeyRecord): Promise<void> {
    this.keys.set(`${record.tenantId}:${record.keyId}`, { ...record });
  }

  async listByTenant(tenantId: string): Promise<ApiKeyRecord[]> {
    return Array.from(this.keys.values()).filter((key) => key.tenantId === tenantId);
  }

  async softDelete(tenantId: string, keyId: string, deletedAt: string): Promise<boolean> {
    const entry = this.keys.get(`${tenantId}:${keyId}`);
    if (!entry) {
      return false;
    }
    entry.enabled = false;
    entry.deletedAt = deletedAt;
    this.keys.set(`${tenantId}:${keyId}`, entry);
    return true;
  }

  async findByHashedKey(hashedKey: string): Promise<ApiKeyRecord | undefined> {
    return Array.from(this.keys.values()).find((record) => record.hashedKey === hashedKey);
  }

  async updateLastUsedAt(tenantId: string, keyId: string, lastUsedAt: string): Promise<void> {
    const entry = this.keys.get(`${tenantId}:${keyId}`);
    if (!entry) {
      return;
    }
    entry.lastUsedAt = lastUsedAt;
    this.keys.set(`${tenantId}:${keyId}`, entry);
  }

  async listRecipes(): Promise<RecipeRecord[]> {
    return [
      {
        id: 'recipe-grade-passback',
        name: 'LMS Grade Passback',
        description: 'Sync grades to LMS after assessment completion.',
        category: 'Assessment',
        standards: ['LTI 1.3', 'OneRoster'],
        estimatedMinutes: 15,
      },
    ];
  }

  async createWorkflow(input: Omit<WorkflowRecord, 'workflowId' | 'versionId' | 'status' | 'createdAt'>): Promise<WorkflowRecord> {
    const workflowId = randomUUID();
    const workflow: WorkflowRecord = {
      ...input,
      workflowId,
      versionId: randomUUID(),
      status: 'DRAFT',
      createdAt: new Date().toISOString(),
    };
    this.workflows.set(`${workflow.tenantId}:${workflow.workflowId}`, workflow);
    return workflow;
  }

  async listWorkflows(tenantId: string, filters: { status?: string; environmentId?: string }): Promise<WorkflowRecord[]> {
    return Array.from(this.workflows.values()).filter(
      (workflow) => workflow.tenantId === tenantId
        && (!filters.status || workflow.status === filters.status)
        && (!filters.environmentId || workflow.environmentId === filters.environmentId),
    );
  }

  async getWorkflow(tenantId: string, workflowId: string): Promise<WorkflowRecord | undefined> {
    return this.workflows.get(`${tenantId}:${workflowId}`);
  }

  async publishWorkflow(tenantId: string, workflowId: string): Promise<WorkflowRecord | undefined> {
    const existing = this.workflows.get(`${tenantId}:${workflowId}`);
    if (!existing) {
      return undefined;
    }
    existing.status = 'PUBLISHED';
    existing.versionId = randomUUID();
    this.workflows.set(`${tenantId}:${workflowId}`, existing);
    return existing;
  }

  async createRun(input: Omit<RunRecord, 'runId' | 'traceId' | 'status' | 'createdAt' | 'stepSummary'>): Promise<RunRecord> {
    const run: RunRecord = {
      ...input,
      runId: randomUUID(),
      traceId: randomUUID(),
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      stepSummary: [],
    };
    this.runs.set(`${run.tenantId}:${run.runId}`, run);
    return run;
  }

  async listRuns(tenantId: string, filters: { workflowId?: string; status?: string; limit?: number }): Promise<RunRecord[]> {
    return Array.from(this.runs.values())
      .filter((run) => run.tenantId === tenantId
        && (!filters.workflowId || run.workflowId === filters.workflowId)
        && (!filters.status || run.status === filters.status))
      .slice(0, filters.limit ?? 50);
  }

  async getRun(tenantId: string, runId: string): Promise<RunRecord | undefined> {
    return this.runs.get(`${tenantId}:${runId}`);
  }
}
