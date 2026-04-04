import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
export interface RunFailedEvent {
    detail: {
        tenantId: string;
        workflowId: string;
        runId: string;
        workflowName?: string;
        failedStepName?: string;
    };
}
export interface NotificationDeps {
    dynamoClient: Pick<DynamoDBDocumentClient, 'send'>;
    mainTableName: string;
    clock?: () => Date;
    uuid?: () => string;
}
export declare function createNotificationHandler(deps: NotificationDeps): (event: RunFailedEvent) => Promise<void>;
export declare const handler: (event: RunFailedEvent) => Promise<void>;
//# sourceMappingURL=handler.d.ts.map