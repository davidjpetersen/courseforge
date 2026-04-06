import type { RunInitializerInput, RunInitializerOutput } from '../shared/types.js';
export interface DynamoClientLike {
    get(params: {
        TableName: string;
        Key: Record<string, unknown>;
    }): Promise<{
        Item?: Record<string, unknown>;
    }>;
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
}
export interface RunInitializerDeps {
    dynamoClient: DynamoClientLike;
    mainTableName: string;
    clock?: () => Date;
}
export declare function createRunInitializerHandler(deps: RunInitializerDeps): (input: RunInitializerInput) => Promise<RunInitializerOutput>;
//# sourceMappingURL=handler.d.ts.map