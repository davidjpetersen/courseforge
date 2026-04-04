import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
export interface StepDefinition {
    stepId: string;
    stepIndex: number;
    connectorKey: string;
    actionType: string;
    params: Record<string, unknown>;
    retryPolicy?: Record<string, unknown>;
}
export interface RunInitializerEvent {
    tenantId: string;
    workflowId: string;
    runId: string;
    traceId: string;
    payload: unknown;
}
export interface RunInitializerDeps {
    dynamoClient: Pick<DynamoDBDocumentClient, 'send'>;
    mainTableName: string;
    clock?: () => Date;
}
export declare function createRunInitializerHandler(deps: RunInitializerDeps): (event: RunInitializerEvent) => Promise<{
    steps: StepDefinition[];
    workflowId: string;
    runId: string;
    tenantId: string;
    traceId: string;
    payload: unknown;
}>;
export declare const handler: (event: RunInitializerEvent) => Promise<{
    steps: StepDefinition[];
    workflowId: string;
    runId: string;
    tenantId: string;
    traceId: string;
    payload: unknown;
}>;
//# sourceMappingURL=handler.d.ts.map