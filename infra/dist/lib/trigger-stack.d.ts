import * as cdk from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';
export interface TriggerStackProps extends cdk.StackProps {
    eventBus: events.IEventBus;
    mainTable: dynamodb.ITable;
}
export declare class TriggerStack extends cdk.Stack {
    readonly schedulesTable: dynamodb.Table;
    readonly webhookApi: apigwv2.HttpApi;
    readonly webhookIngressFn: lambda.Function;
    readonly scheduledTriggerFn: lambda.Function;
    readonly workflowRunnerStateMachine: sfn.StateMachine;
    readonly schedulerTargetRole: iam.Role;
    constructor(scope: Construct, id: string, props: TriggerStackProps);
}
