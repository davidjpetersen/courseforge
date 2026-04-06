import { auditSK, tenantPK, workflowPK } from '../../src/models/schema.js';

const VERSION_PREFIX = 'VERSION#';
const RUN_PREFIX = 'RUN#';
const STEP_PREFIX = 'STEP#';
const NOTIFICATION_PREFIX = 'NOTIFICATION#';
const USER_PREFIX = 'USER#';

export function workflowVersionPK(workflowId: string): string {
  return workflowPK(workflowId);
}

export function workflowVersionSK(versionId: string): string {
  return `${VERSION_PREFIX}${versionId}`;
}

export function runRecordPK(tenantId: string): string {
  return tenantPK(tenantId);
}

export function runRecordSK(timestamp: string, runId: string): string {
  return `${RUN_PREFIX}${timestamp}#${runId}`;
}

export function runStepRecordPK(runId: string): string {
  return `${RUN_PREFIX}${runId}`;
}

export function runStepRecordSK(stepIndex: number, stepId: string): string {
  return `${STEP_PREFIX}${String(stepIndex).padStart(4, '0')}#${stepId}`;
}

export function auditEntryPK(tenantId: string): string {
  return tenantPK(tenantId);
}

export function auditEntrySK(timestamp: string, runId: string): string {
  return auditSK(timestamp, runId);
}

export function notificationRecordPK(userId: string): string {
  return `${USER_PREFIX}${userId}`;
}

export function notificationRecordSK(timestamp: string, notificationId: string): string {
  return `${NOTIFICATION_PREFIX}${timestamp}#${notificationId}`;
}
