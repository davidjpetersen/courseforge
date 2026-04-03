import { type APIGatewayProxyEvent, type APIGatewayProxyResult } from './shared.js';
export interface DynamoScheduleClient {
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
        ExpressionAttributeNames?: Record<string, string>;
        ExpressionAttributeValues?: Record<string, unknown>;
    }): Promise<unknown>;
}
export interface SchedulerClientLike {
    createSchedule(input: {
        Name: string;
        GroupName: string;
        ScheduleExpression: string;
        FlexibleTimeWindow: {
            Mode: 'OFF';
        };
        Target: {
            Arn: string;
            RoleArn: string;
            Input: string;
        };
    }): Promise<unknown>;
    deleteSchedule(input: {
        Name: string;
        GroupName: string;
    }): Promise<unknown>;
}
export interface CreateScheduleHandlerDeps {
    dynamoClient: DynamoScheduleClient;
    schedulerClient: SchedulerClientLike;
    schedulesTableName: string;
    scheduleGroupName: string;
    targetArn: string;
    targetRoleArn: string;
}
export interface DeleteScheduleHandlerDeps {
    dynamoClient: DynamoScheduleClient;
    schedulerClient: SchedulerClientLike;
    schedulesTableName: string;
    scheduleGroupName: string;
}
export declare function buildSchedulePreview(cronExpression: string): string;
export declare function createCreateScheduleHandler(deps: CreateScheduleHandlerDeps): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
export declare function createDeleteScheduleHandler(deps: DeleteScheduleHandlerDeps): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
//# sourceMappingURL=schedule.d.ts.map