import { RunStatus } from '../../packages/types/src/index';

export interface StepRetryPolicy {
  maxAttempts: number;
  backoffRate: number;
}

export interface StepDefinition {
  stepId: string;
  stepIndex: number;
  connectorKey: string;
  actionType: string;
  params: Record<string, unknown>;
  retryPolicy: StepRetryPolicy;
}

export interface RunRecord {
  PK: string;
  SK: string;
  tenantId: string;
  workflowId: string;
  runId: string;
  traceId?: string;
  versionId?: string;
  status: RunStatus | 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  triggerType: 'manual' | 'scheduled' | 'webhook' | 'replay';
  payload?: Record<string, unknown>;
  parentRunId?: string;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  createdAt?: string;
  failedStepId?: string;
  errorMessage?: string;
  errorCode?: string;
}

export interface RunStepError {
  message: string;
  code: string;
  rawResponse?: unknown;
}

export interface RunStepRecord {
  PK: string;
  SK: string;
  runId: string;
  stepId: string;
  stepIndex: number;
  connectorKey: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
  startedAt: string;
  endedAt?: string;
  output?: unknown;
  outputRef?: string;
  error?: RunStepError;
}

export interface AuditEntry {
  PK: string;
  SK: string;
  tenantId: string;
  actionType: 'RUN_COMPLETED' | 'RUN_FAILED';
  runId: string;
  workflowId: string;
  status: 'SUCCESS' | 'FAILED';
  durationMs: number;
  createdAt: string;
}

export interface NotificationRecord {
  PK: string;
  SK: string;
  type: 'RUN_FAILED';
  workflowId: string;
  runId: string;
  workflowName: string;
  failedStepName: string;
  read: boolean;
  createdAt: string;
}

export interface RunInitializerInput {
  tenantId: string;
  workflowId: string;
  runId: string;
  traceId: string;
  payload: Record<string, unknown>;
}

export interface RunInitializerOutput {
  steps: StepDefinition[];
  workflowId: string;
  runId: string;
  tenantId: string;
  traceId: string;
  payload: Record<string, unknown>;
  versionId: string;
}

export interface ExecuteStepInput {
  step: StepDefinition;
  runId: string;
  tenantId: string;
  traceId: string;
  accumulatedContext: Record<string, unknown>;
}

export interface ExecuteStepOutput {
  accumulatedContext: Record<string, unknown>;
  stepResult: unknown;
}

export interface RunFinalizerInput {
  runId: string;
  tenantId: string;
  workflowId: string;
  status: 'SUCCESS' | 'FAILED';
  error?: { failedStepId: string; errorMessage: string; errorCode: string };
  stepResults?: Array<Record<string, unknown>>;
}

export interface RunFinalizerOutput {
  runId: string;
  status: 'SUCCESS' | 'FAILED';
}

export interface RunFailedEvent {
  tenantId: string;
  workflowId: string;
  runId: string;
  status: 'FAILED';
  durationMs: number;
}

export interface ReplayResponse {
  newRunId: string;
  parentRunId: string;
}

export interface RunDomainEventDetail {
  tenantId: string;
  workflowId: string;
  runId: string;
  status: 'SUCCESS' | 'FAILED';
  durationMs: number;
}

export interface RunDomainEvent {
  source: 'courseforge.run' | 'courseforge.trigger';
  'detail-type': 'RunCompleted' | 'RunFailed' | 'RunReplayed';
  detail: RunDomainEventDetail;
}
