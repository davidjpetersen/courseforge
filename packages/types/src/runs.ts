import type { RunStatus } from './events.js';

export interface Run {
  runId: string;
  workflowId: string;
  workflowName: string;
  tenantId: string;
  versionId: string;
  status: RunStatus;
  triggerType: 'webhook' | 'scheduled' | 'replay';
  triggerEventId: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  parentRunId?: string;
  failedStepId?: string;
}

export interface RunStep {
  stepId: string;
  stepIndex: number;
  label: string;
  connectorKey: string;
  status: RunStatus;
  startedAt: string;
  endedAt?: string;
  inputSummary: string;
  outputSummary: string;
  errorMessage?: string;
  errorCode?: string;
  rawResponse?: string;
}

export interface Notification {
  notificationId: string;
  type: string;
  workflowId: string;
  workflowName: string;
  runId: string;
  failedStepName: string;
  read: boolean;
  createdAt: string;
}
