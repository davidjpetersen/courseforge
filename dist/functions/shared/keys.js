import { auditSK, tenantPK, workflowPK } from '../../src/models/schema.js';
const VERSION_PREFIX = 'VERSION#';
const RUN_PREFIX = 'RUN#';
const STEP_PREFIX = 'STEP#';
const NOTIFICATION_PREFIX = 'NOTIFICATION#';
const USER_PREFIX = 'USER#';
export function workflowVersionPK(workflowId) {
    return workflowPK(workflowId);
}
export function workflowVersionSK(versionId) {
    return `${VERSION_PREFIX}${versionId}`;
}
export function runRecordPK(tenantId) {
    return tenantPK(tenantId);
}
export function runRecordSK(timestamp, runId) {
    return `${RUN_PREFIX}${timestamp}#${runId}`;
}
export function runStepRecordPK(runId) {
    return `${RUN_PREFIX}${runId}`;
}
export function runStepRecordSK(stepIndex, stepId) {
    return `${STEP_PREFIX}${String(stepIndex).padStart(4, '0')}#${stepId}`;
}
export function auditEntryPK(tenantId) {
    return tenantPK(tenantId);
}
export function auditEntrySK(timestamp, runId) {
    return auditSK(timestamp, runId);
}
export function notificationRecordPK(userId) {
    return `${USER_PREFIX}${userId}`;
}
export function notificationRecordSK(timestamp, notificationId) {
    return `${NOTIFICATION_PREFIX}${timestamp}#${notificationId}`;
}
//# sourceMappingURL=keys.js.map