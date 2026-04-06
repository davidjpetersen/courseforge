export declare function workflowVersionPK(workflowId: string): string;
export declare function workflowVersionSK(versionId: string): string;
export declare function runRecordPK(tenantId: string): string;
export declare function runRecordSK(timestamp: string, runId: string): string;
export declare function runStepRecordPK(runId: string): string;
export declare function runStepRecordSK(stepIndex: number, stepId: string): string;
export declare function auditEntryPK(tenantId: string): string;
export declare function auditEntrySK(timestamp: string, runId: string): string;
export declare function notificationRecordPK(userId: string): string;
export declare function notificationRecordSK(timestamp: string, notificationId: string): string;
//# sourceMappingURL=keys.d.ts.map