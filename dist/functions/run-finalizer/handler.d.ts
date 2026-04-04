import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
export interface RunFinalizerEvent {
    runId: string;
    tenantId: string;
    workflowId: string;
    status: 'SUCCESS' | 'FAILED';
    error?: {
        failedStepId?: string;
        message?: string;
        code?: string;
    };
    stepResults?: unknown;
}
export interface RunFinalizerDeps {
    dynamoClient: Pick<DynamoDBDocumentClient, 'send'>;
    eventBridgeClient: {
        putEvents(params: {
            Entries: Array<{
                EventBusName: string;
                Source: string;
                DetailType: string;
                Detail: string;
            }>;
        }): Promise<unknown>;
    };
    mainTableName: string;
    eventBusName: string;
    clock?: () => Date;
}
export declare function createRunFinalizerHandler(deps: RunFinalizerDeps): (event: RunFinalizerEvent) => Promise<{
    runId: string;
    status: "SUCCESS" | "FAILED";
}>;
export declare const handler: (event: RunFinalizerEvent) => Promise<{
    runId: string;
    status: "SUCCESS" | "FAILED";
}>;
//# sourceMappingURL=handler.d.ts.map