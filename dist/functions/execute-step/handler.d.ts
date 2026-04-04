import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { StepDefinition } from '../run-initializer/handler.js';
export interface ExecuteStepEvent {
    step: StepDefinition;
    runId: string;
    tenantId: string;
    traceId: string;
    accumulatedContext: Record<string, unknown>;
}
export interface ExecuteStepDeps {
    dynamoClient: Pick<DynamoDBDocumentClient, 'send'>;
    s3Client: {
        putObject(params: Record<string, unknown>): Promise<unknown>;
    };
    cloudWatchClient: {
        putMetricData(params: Record<string, unknown>): Promise<unknown>;
    };
    mainTableName: string;
    artifactBucketName: string;
    clock?: () => Date;
}
export declare function createExecuteStepHandler(deps: ExecuteStepDeps): (event: ExecuteStepEvent) => Promise<Record<string, unknown>>;
export declare const handler: (event: ExecuteStepEvent) => Promise<Record<string, unknown>>;
//# sourceMappingURL=handler.d.ts.map