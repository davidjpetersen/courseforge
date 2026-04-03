import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import { Construct } from 'constructs';
export interface FoundationStackProps extends cdk.StackProps {
}
export declare class FoundationStack extends cdk.Stack {
    readonly eventBus: events.IEventBus;
    readonly eventBusArn: string;
    readonly eventBusName: string;
    readonly mainTable: dynamodb.ITable;
    readonly mainTableName: string;
    readonly mainTableArn: string;
    readonly artifactBucketName: string;
    constructor(scope: Construct, id: string, props: FoundationStackProps);
}
