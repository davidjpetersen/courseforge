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
export declare const JSON_HEADERS: {
    'Content-Type': string;
};
export declare function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult;
export declare function getHeader(headers: Record<string, string> | null | undefined, name: string): string | undefined;
export declare function parseJsonBody(body: string | null | undefined): unknown | Error;
export declare function resolveTenantId(event: APIGatewayProxyEvent, parsedBody?: Record<string, unknown>): string | null;
//# sourceMappingURL=shared.d.ts.map