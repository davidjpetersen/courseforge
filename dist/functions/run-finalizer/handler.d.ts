import type { RunFinalizerInput, RunFinalizerOutput } from '../shared/types.js';
export interface DynamoClientLike {
    query(params: {
        TableName: string;
        KeyConditionExpression: string;
        ExpressionAttributeValues: Record<string, unknown>;
        FilterExpression?: string;
        Limit?: number;
    }): Promise<{
        Items?: Array<Record<string, unknown>>;
    }>;
    update(params: {
        TableName: string;
        Key: Record<string, unknown>;
        UpdateExpression: string;
        ExpressionAttributeValues: Record<string, unknown>;
        ExpressionAttributeNames?: Record<string, string>;
    }): Promise<unknown>;
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
export interface RunFinalizerDeps {
    dynamoClient: DynamoClientLike;
    eventBridgeClient: EventBridgeClientLike;
    mainTableName: string;
    eventBusName: string;
    clock?: () => Date;
}
export declare function createRunFinalizerHandler(deps: RunFinalizerDeps): (input: RunFinalizerInput) => Promise<RunFinalizerOutput>;
//# sourceMappingURL=handler.d.ts.map