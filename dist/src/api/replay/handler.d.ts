import { findRunRecordById } from '../../../functions/shared/run-records.js';
export interface APIGatewayProxyEvent {
    pathParameters?: Record<string, string> | null;
    requestContext?: {
        authorizer?: {
            tenantId?: string;
        };
    };
}
export interface APIGatewayProxyResult {
    statusCode: number;
    headers?: Record<string, string>;
    body: string;
}
export interface DynamoClientLike {
    query: Parameters<typeof findRunRecordById>[0]['query'];
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
export interface ReplayHandlerDeps {
    dynamoClient: DynamoClientLike;
    eventBridgeClient: EventBridgeClientLike;
    mainTableName: string;
    eventBusName: string;
    clock?: () => Date;
    uuid?: () => string;
}
export declare function createReplayHandler(deps: ReplayHandlerDeps): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
//# sourceMappingURL=handler.d.ts.map