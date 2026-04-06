import type { RuntimeConnector } from '../shared/connectors.js';
import type { ExecuteStepInput, ExecuteStepOutput } from '../shared/types.js';
export interface DynamoClientLike {
    put(params: {
        TableName: string;
        Item: Record<string, unknown>;
    }): Promise<unknown>;
    update(params: {
        TableName: string;
        Key: Record<string, unknown>;
        UpdateExpression: string;
        ExpressionAttributeValues: Record<string, unknown>;
        ExpressionAttributeNames?: Record<string, string>;
    }): Promise<unknown>;
}
export interface S3ClientLike {
    putObject(params: {
        Bucket: string;
        Key: string;
        Body: string;
        ContentType: string;
    }): Promise<unknown>;
}
export interface MetricsLike {
    putMetric(name: string, value: number, unit: string): void;
}
export interface ExecuteStepDeps {
    dynamoClient: DynamoClientLike;
    s3Client: S3ClientLike;
    mainTableName: string;
    artifactBucketName: string;
    connectors?: Map<string, RuntimeConnector>;
    clock?: () => Date;
    metrics?: MetricsLike;
}
export declare function createExecuteStepHandler(deps: ExecuteStepDeps): (input: ExecuteStepInput) => Promise<ExecuteStepOutput>;
//# sourceMappingURL=handler.d.ts.map