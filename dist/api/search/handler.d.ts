/**
 * Lambda handler for the Search API.
 *
 * GET /search?q={query}&category={cat1,cat2}  — Full-text search with optional category filter
 *
 * The OpenSearch client is abstracted behind an interface so the handler
 * can be tested with in-memory implementations.
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
export interface SearchClient {
    /**
     * Search templates by query text with optional category filter.
     * Returns matching templates.
     *
     * For production: queries OpenSearch Serverless.
     * For testing: can use in-memory implementation.
     */
    search(query: string, categories: string[]): Promise<Template[]>;
    /**
     * Returns all templates (used for suggestion generation when zero results).
     */
    listAll(): Promise<Template[]>;
}
export declare function createSearchHandler(client: SearchClient): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
//# sourceMappingURL=handler.d.ts.map