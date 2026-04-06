import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';
export interface OrchestrationStackProps extends cdk.StackProps {
    mainTable: dynamodb.ITable;
    artifactBucket: s3.IBucket;
    eventBus: events.IEventBus;
}
export declare class OrchestrationStack extends cdk.Stack {
    readonly workflowRunnerStateMachine: sfn.StateMachine;
    readonly runInitializerFn: lambda.Function;
    readonly executeStepFn: lambda.Function;
    readonly runFinalizerFn: lambda.Function;
    readonly notificationFn: lambda.Function;
    constructor(scope: Construct, id: string, props: OrchestrationStackProps);
}
