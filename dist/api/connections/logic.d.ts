import type { AuditLogEntry, ConnectionListItem, ConnectionRecord, ConnectionStatus, ConnectorDefinition, DependentWorkflow, TestResult, Workflow } from '../../models/types.js';
export type ValidationResult = {
    valid: true;
} | {
    valid: false;
    errors: Array<{
        field: string;
        message: string;
    }>;
};
export declare function validateCredentials(connectorKey: string, credentials: Record<string, unknown>, registry: Map<string, ConnectorDefinition>): ValidationResult;
export declare function mapConnectionToListItem(connection: ConnectionRecord): ConnectionListItem;
export declare function mapTestResultToStatus(result: TestResult): ConnectionStatus;
export declare function filterDependentWorkflows(workflows: Workflow[], connectionId: string): DependentWorkflow[];
export declare function hasPublishedDependents(dependents: DependentWorkflow[]): boolean;
export declare function buildAuditEntry(tenantId: string, actionType: 'CONNECTION_ROTATED' | 'CONNECTION_DELETED', actor: string, resourceId: string, ip: string): AuditLogEntry;
export interface NewConnectionInput {
    tenantId: string;
    connectorKey: string;
    displayName: string;
    authType: ConnectionRecord['authType'];
    secretRef: string;
    createdBy: string;
    scopes?: string[];
}
export interface NewConnectionOptions {
    connectionId?: string;
    now?: string;
}
export declare function buildNewConnectionRecord(input: NewConnectionInput, options?: NewConnectionOptions): ConnectionRecord;
export declare function buildSecretName(tenantId: string, connectionId: string): string;
//# sourceMappingURL=logic.d.ts.map