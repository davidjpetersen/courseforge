import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
export interface HttpActionParams {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    url: string;
    headers?: Record<string, string>;
    body?: string;
    maxRetries?: number;
    initialDelayMs?: number;
}
export interface ConnectorContext {
    variables: Record<string, string>;
    workflowId: string;
    tenantId: string;
    traceId: string;
}
export interface HttpActionResult {
    statusCode: number;
    headers: Record<string, string>;
    body: string;
}
export declare class HttpActionError extends Error {
    readonly statusCode: number;
    readonly responseBody: string;
    constructor(message: string, statusCode: number, responseBody: string);
}
export interface HttpActionDeps {
    secretsClient: {
        send(command: GetSecretValueCommand): Promise<{
            SecretString?: string;
        }>;
    };
    httpClient?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    logger?: Pick<Console, 'log'>;
}
export declare function executeHttpAction(params: HttpActionParams, context: ConnectorContext, deps: HttpActionDeps): Promise<HttpActionResult>;
export { GetSecretValueCommand, SecretsManagerClient };
//# sourceMappingURL=index.d.ts.map