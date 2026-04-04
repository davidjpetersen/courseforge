import { type Connection, type Recipe, type StepDefinition } from '../../../packages/utils/src/compile-plan.js';
export type WorkflowStatus = 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'ARCHIVED';
export interface WorkflowRecord {
    PK: string;
    SK: string;
    workflowId: string;
    tenantId: string;
    name: string;
    description: string;
    recipeId: string;
    status: WorkflowStatus;
    currentVersionId: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    connectionIds: string[];
    environmentId: 'dev' | 'prod';
}
export interface WorkflowVersionRecord {
    PK: string;
    SK: string;
    versionId: string;
    workflowId: string;
    semver: string;
    compiledPlan: StepDefinition[];
    createdBy: string;
    createdAt: string;
    recipeId: string;
    paramSnapshot: Record<string, unknown>;
}
export interface APIGatewayProxyEvent {
    httpMethod: string;
    path: string;
    pathParameters?: Record<string, string> | null;
    queryStringParameters?: Record<string, string> | null;
    headers?: Record<string, string> | null;
    body?: string | null;
}
export interface APIGatewayProxyResult {
    statusCode: number;
    headers?: Record<string, string>;
    body: string;
}
export interface WorkflowRepository {
    createWorkflow(workflow: WorkflowRecord): Promise<void>;
    updateWorkflow(workflow: WorkflowRecord): Promise<void>;
    getWorkflow(tenantId: string, workflowId: string): Promise<WorkflowRecord | null>;
    listWorkflows(tenantId: string): Promise<WorkflowRecord[]>;
    createVersion(version: WorkflowVersionRecord): Promise<void>;
    getVersion(workflowId: string, semver: string): Promise<WorkflowVersionRecord | null>;
    listVersions(workflowId: string): Promise<WorkflowVersionRecord[]>;
}
export interface ConnectionRepository {
    listByIds(tenantId: string, connectionIds: string[]): Promise<Connection[]>;
}
export interface RecipeRegistry {
    getById(recipeId: string): Recipe | null;
}
export interface TriggerRepository {
    hasWebhookSecret(tenantId: string, workflowId: string): Promise<boolean>;
    hasEnabledSchedule(workflowId: string): Promise<boolean>;
    disableSchedules(workflowId: string): Promise<void>;
}
export interface AuditRepository {
    write(entry: {
        tenantId: string;
        workflowId: string;
        actionType: 'WORKFLOW_PUBLISHED' | 'WORKFLOW_PAUSED' | 'WORKFLOW_ARCHIVED';
        actor: string;
        timestamp: string;
    }): Promise<void>;
}
export interface EventBridgePublisher {
    putEvent(input: {
        source: 'courseforge.workflow';
        detailType: 'WorkflowPublished';
        detail: {
            tenantId: string;
            workflowId: string;
            versionId: string;
        };
    }): Promise<void>;
}
export declare function createCreateWorkflowHandler(workflowRepo: WorkflowRepository, connectionRepo: ConnectionRepository, recipeRegistry: RecipeRegistry): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
export declare function createListWorkflowsHandler(workflowRepo: WorkflowRepository): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
export declare function createGetWorkflowHandler(workflowRepo: WorkflowRepository): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
export declare function createPublishWorkflowHandler(workflowRepo: WorkflowRepository, connectionRepo: ConnectionRepository, triggerRepo: TriggerRepository, auditRepo: AuditRepository, eventBridge: EventBridgePublisher): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
export declare function createPauseWorkflowHandler(workflowRepo: WorkflowRepository, triggerRepo: TriggerRepository, auditRepo: AuditRepository): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
export declare function createArchiveWorkflowHandler(workflowRepo: WorkflowRepository, triggerRepo: TriggerRepository, auditRepo: AuditRepository): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
export declare function createListWorkflowVersionsHandler(workflowRepo: WorkflowRepository): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
//# sourceMappingURL=handlers.d.ts.map