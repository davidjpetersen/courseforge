export interface APIGatewayProxyEvent {
    pathParameters?: Record<string, string> | null;
    headers?: Record<string, string> | null;
    body?: string | null;
}
export interface APIGatewayProxyResult {
    statusCode: number;
    headers?: Record<string, string>;
    body: string;
}
export interface DynamoClientLike {
    get(params: {
        TableName: string;
        Key: Record<string, unknown>;
    }): Promise<{
        Item?: Record<string, unknown>;
    }>;
    put(params: {
        TableName: string;
        Item: Record<string, unknown>;
    }): Promise<unknown>;
}
export interface EventBridgeClientLike {
    putEvents(params: {
        Entries: Array<{
            EventBusName: string;
            Source: string;
            DetailType: string;
            Detail: string;
        }>;
    }): Promise<unknown>;
}
export interface WebhookIngressDeps {
    dynamoClient: DynamoClientLike;
    eventBridgeClient: EventBridgeClientLike;
    mainTableName: string;
    eventBusName: string;
    clock?: () => Date;
    uuid?: () => string;
}
export declare function parseAuthorizationHeader(authorizationHeader: string | undefined): {
    tenantId: string;
    token: string;
} | null;
export declare function createWebhookIngressHandler(deps: WebhookIngressDeps): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
//# sourceMappingURL=handler.d.ts.map