/**
 * Core domain types for the Recipe Library.
 */
export interface FieldValidation {
    pattern?: string;
    min?: number;
    max?: number;
    options?: string[];
}
export type FieldType = 'text' | 'select' | 'number' | 'boolean' | 'connection';
export interface FieldDefinition {
    fieldId: string;
    label: string;
    type: FieldType;
    required: boolean;
    helpText: string;
    validation: FieldValidation;
    connectedSystem: string | null;
}
export interface StepDefinition {
    stepIndex: number;
    title: string;
    helpText: string;
    fields: FieldDefinition[];
}
export interface Template {
    templateId: string;
    name: string;
    description: string;
    categories: string[];
    connectedSystems: string[];
    requiredParameters: FieldDefinition[];
    timeToActivate: string;
    educationStandardTags: string[];
    steps: StepDefinition[];
    certified: boolean;
    createdAt: string;
}
export type FieldValue = string | number | boolean | null;
export interface WizardStepConfig {
    stepIndex: number;
    fields: Record<string, FieldValue>;
    testResult?: 'pass' | 'fail' | null;
}
export interface WizardConfiguration {
    templateId: string;
    steps: WizardStepConfig[];
}
export interface WorkflowDSLStep {
    stepIndex: number;
    action: string;
    parameters: Record<string, FieldValue>;
    connectedSystem: string | null;
}
export interface WorkflowMetadata {
    tenantId: string;
    createdBy: string;
    createdAt: string;
}
export interface WorkflowDSL {
    version: string;
    templateId: string;
    name: string;
    steps: WorkflowDSLStep[];
    metadata: WorkflowMetadata;
}
export type WorkflowStatus = 'active' | 'paused' | 'failed';
export interface Workflow {
    workflowId: string;
    tenantId: string;
    templateId: string;
    name: string;
    configuration: Record<string, unknown>;
    dslDefinition: string;
    status: WorkflowStatus;
    connectionIds?: string[];
    createdBy: string;
    createdAt: string;
    updatedAt: string;
}
export type AuthType = 'oauth2' | 'apikey' | 'basic';
export type ConnectionStatus = 'active' | 'error' | 'pending' | 'deleted';
export interface ConnectionRecord {
    connectionId: string;
    tenantId: string;
    connectorKey: string;
    displayName: string;
    authType: AuthType;
    secretRef: string;
    scopes: string[];
    status: ConnectionStatus;
    createdAt: string;
    updatedAt: string;
    lastTestedAt: string | null;
    createdBy: string;
    deletedAt: string | null;
}
export interface ConnectionListItem {
    connectionId: string;
    displayName: string;
    connectorKey: string;
    authType: AuthType;
    status: ConnectionStatus;
    createdAt: string;
    lastTestedAt: string | null;
}
export interface SecretValue {
    accessToken?: string;
    refreshToken?: string;
    apiKey?: string;
    username?: string;
    password?: string;
    expiresAt?: string;
    baseUrl?: string;
    [key: string]: unknown;
}
export interface DependentWorkflow {
    workflowId: string;
    name: string;
    status: string;
}
export interface AuditLogEntry {
    PK: string;
    SK: string;
    tenantId: string;
    actionType: 'CONNECTION_ROTATED' | 'CONNECTION_DELETED';
    actor: string;
    resourceId: string;
    ip: string;
    timestamp: string;
}
export interface TestResult {
    success: boolean;
    message: string;
}
export interface ConnectorDefinition {
    key: string;
    displayName: string;
    authType: AuthType;
    credentialSchema: Record<string, unknown>;
    testFn: (credentials: Record<string, unknown>, baseUrl?: string) => Promise<TestResult>;
}
//# sourceMappingURL=types.d.ts.map