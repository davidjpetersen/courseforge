import { type APIGatewayProxyEvent, type APIGatewayProxyResult } from './shared.js';
export interface DynamoWriteClient {
    put(params: {
        TableName: string;
        Item: Record<string, unknown>;
    }): Promise<unknown>;
}
export interface WebhookSecretHandlerDeps {
    dynamoClient: DynamoWriteClient;
    mainTableName: string;
}
export declare function createWebhookSecretHandler(deps: WebhookSecretHandlerDeps): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
//# sourceMappingURL=webhook-secret.d.ts.map