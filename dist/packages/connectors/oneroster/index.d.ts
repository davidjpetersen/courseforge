export interface JSONSchema7 {
    type?: string;
    properties?: Record<string, JSONSchema7>;
    required?: string[];
    enum?: string[];
    items?: JSONSchema7;
    additionalProperties?: boolean;
}
export interface ConnectorDefinition<TParams = unknown, TResult = unknown> {
    key: string;
    displayName: string;
    authType: 'oauth2' | 'apikey' | 'basic';
    credentialSchema: JSONSchema7;
    testFn: (credentials: Record<string, unknown>) => Promise<boolean>;
    run: (params: TParams, context: ConnectorContext) => Promise<TResult>;
}
export interface ConnectorContext {
    tenantId: string;
    runId: string;
    metrics?: {
        putMetric: (name: string, value: number, namespace: string) => void;
    };
    s3Client?: {
        putObject(input: {
            bucket: string;
            key: string;
            body: string;
            contentType: string;
        }): Promise<unknown>;
    };
}
export interface FieldMapping {
    sourceField: string;
    targetField: string;
}
export interface OneRosterParams {
    baseUrl: string;
    syncScope: 'delta' | 'full';
    targetOrgId?: string;
    lastSyncedAt?: string;
    fieldMappings: FieldMapping[];
    clientId?: string;
    clientSecret?: string;
}
export interface OneRosterSyncError {
    recordId: string;
    recordType: 'user' | 'class' | 'enrollment';
    errorCode: string;
    message: string;
}
export interface OneRosterResult {
    synced: number;
    added: number;
    updated: number;
    removed: number;
    errors: OneRosterSyncError[];
    lastSyncedAt: string;
}
export declare class BatchSyncThresholdError extends Error {
    readonly errorRate: number;
    readonly total: number;
    constructor(errorRate: number, total: number);
}
export declare function buildEnrollmentsUrl(baseUrl: string, since?: string): string;
export declare function filterEnrollmentsByOrg(enrollments: Record<string, unknown>[], targetOrgId?: string): Record<string, unknown>[];
export declare function buildUserIdBatches(userIds: string[]): string[][];
export declare function getAccessToken(baseUrl: string, clientId: string, clientSecret: string): Promise<string>;
export declare function fetchEnrollments(baseUrl: string, accessToken: string, since?: string): Promise<Record<string, unknown>[]>;
export declare function fetchUsers(baseUrl: string, accessToken: string, userIds: string[]): Promise<Record<string, unknown>[]>;
export declare function applyFieldMappings(record: Record<string, unknown>, mappings: FieldMapping[]): Record<string, unknown>;
export declare function syncToTarget(mappedRecords: Record<string, unknown>[], context: ConnectorContext): Promise<number>;
export declare function ensureErrorThreshold(total: number, errorCount: number): void;
export declare const oneRosterConnector: ConnectorDefinition<OneRosterParams, OneRosterResult>;
export default oneRosterConnector;
//# sourceMappingURL=index.d.ts.map