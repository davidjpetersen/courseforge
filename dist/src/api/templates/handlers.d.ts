/**
 * Lambda handlers for the Template API.
 *
 * GET /templates           — list all templates, optional ?category= filter
 * GET /templates/{templateId} — get template detail with missing connections
 */
import type { Template } from '../../models/types.js';
export interface APIGatewayProxyEvent {
    httpMethod: string;
    path: string;
    pathParameters?: Record<string, string> | null;
    queryStringParameters?: Record<string, string> | null;
    headers?: Record<string, string> | null;
}
export interface APIGatewayProxyResult {
    statusCode: number;
    headers?: Record<string, string>;
    body: string;
}
export interface TemplateRepository {
    /** Return all templates. */
    listAll(): Promise<Template[]>;
    /** Return a single template by ID, or null if not found. */
    getById(templateId: string): Promise<Template | null>;
}
export interface TenantConnectionProvider {
    /** Return the set of connection names the tenant has configured. */
    getConfiguredConnections(tenantId: string): Promise<string[]>;
}
export declare function createListTemplatesHandler(repo: TemplateRepository): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
export declare function createGetTemplateHandler(repo: TemplateRepository, connectionProvider: TenantConnectionProvider): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
//# sourceMappingURL=handlers.d.ts.map