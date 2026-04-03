import type { Workflow } from '../../models/types.js';
import type { AuditLogEntry, ConnectionRecord, ConnectorDefinition } from '../../models/types.js';
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
export interface ConnectionRepository {
    create(connection: ConnectionRecord): Promise<void>;
    getById(tenantId: string, connectionId: string): Promise<ConnectionRecord | null>;
    listByTenant(tenantId: string): Promise<ConnectionRecord[]>;
    update(tenantId: string, connectionId: string, fields: Partial<ConnectionRecord>): Promise<void>;
    softDelete(tenantId: string, connectionId: string, deletedAt: string): Promise<void>;
}
export interface WorkflowRepository {
    listByTenant(tenantId: string): Promise<Workflow[]>;
}
export interface SecretsService {
    createSecret(secretName: string, value: Record<string, unknown>): Promise<string>;
    getSecretValue(secretRef: string): Promise<Record<string, unknown>>;
    putSecretValue(secretRef: string, value: Record<string, unknown>): Promise<void>;
    scheduleDelete(secretRef: string, recoveryWindowDays: number): Promise<void>;
}
export interface AuditRepository {
    writeEntry(entry: AuditLogEntry): Promise<void>;
}
export interface CreateConnectionRequest {
    tenantId: string;
    connectorKey: string;
    displayName: string;
    authType: ConnectionRecord['authType'];
    credentials: Record<string, unknown>;
    createdBy?: string;
    scopes?: string[];
}
export interface RotateConnectionRequest {
    tenantId: string;
    credentials: Record<string, unknown>;
}
export declare function createConnectionHandler(repo: ConnectionRepository, secrets: SecretsService, registry: Map<string, ConnectorDefinition>): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
export declare function testConnectionHandler(repo: ConnectionRepository, secrets: SecretsService, registry: Map<string, ConnectorDefinition>): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
export declare function listConnectionsHandler(repo: ConnectionRepository): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
export declare function getDependenciesHandler(repo: ConnectionRepository, workflowRepo: WorkflowRepository): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
export declare function rotateConnectionHandler(repo: ConnectionRepository, secrets: SecretsService, registry: Map<string, ConnectorDefinition>, audit: AuditRepository): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
export declare function deleteConnectionHandler(repo: ConnectionRepository, secrets: SecretsService, workflowRepo: WorkflowRepository, audit: AuditRepository): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
//# sourceMappingURL=handlers.d.ts.map