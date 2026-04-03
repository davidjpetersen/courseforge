export interface ScheduledTriggerEvent {
    workflowId: string;
    tenantId: string;
    scheduleId: string;
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
    update(params: {
        TableName: string;
        Key: Record<string, unknown>;
        UpdateExpression: string;
        ExpressionAttributeValues?: Record<string, unknown>;
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
export interface ScheduledTriggerDeps {
    dynamoClient: DynamoClientLike;
    eventBridgeClient: EventBridgeClientLike;
    mainTableName: string;
    schedulesTableName: string;
    eventBusName: string;
    clock?: () => Date;
    uuid?: () => string;
    logger?: Pick<Console, 'warn'>;
}
export declare function createScheduledTriggerHandler(deps: ScheduledTriggerDeps): (event: ScheduledTriggerEvent) => Promise<void>;
//# sourceMappingURL=handler.d.ts.map