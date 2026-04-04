import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';

export interface OrchestrationStackProps extends cdk.StackProps {
  eventBus: events.IEventBus;
  mainTable: dynamodb.ITable;
  artifactBucket: s3.IBucket;
}

export class OrchestrationStack extends cdk.Stack {
  public readonly workflowRunnerStateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: OrchestrationStackProps) {
    super(scope, id, props);

    const runInitializerFn = new lambda.Function(this, 'RunInitializerFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async (event) => event;'),
      timeout: cdk.Duration.seconds(30),
      environment: {
        MAIN_TABLE_NAME: props.mainTable.tableName,
      },
    });

    const executeStepFn = new lambda.Function(this, 'ExecuteStepFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async (event) => event;'),
      timeout: cdk.Duration.minutes(5),
      environment: {
        MAIN_TABLE_NAME: props.mainTable.tableName,
        ARTIFACT_BUCKET_NAME: props.artifactBucket.bucketName,
      },
    });

    const runFinalizerFn = new lambda.Function(this, 'RunFinalizerFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async (event) => event;'),
      timeout: cdk.Duration.seconds(30),
      environment: {
        MAIN_TABLE_NAME: props.mainTable.tableName,
        EVENT_BUS_NAME: props.eventBus.eventBusName,
      },
    });

    const notificationFn = new lambda.Function(this, 'NotificationFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async () => undefined;'),
      timeout: cdk.Duration.seconds(30),
      environment: {
        MAIN_TABLE_NAME: props.mainTable.tableName,
      },
    });

    props.mainTable.grantReadWriteData(runInitializerFn);
    props.mainTable.grantReadWriteData(executeStepFn);
    props.mainTable.grantReadWriteData(runFinalizerFn);
    props.mainTable.grantReadWriteData(notificationFn);
    props.artifactBucket.grantReadWrite(executeStepFn);
    props.eventBus.grantPutEventsTo(runFinalizerFn);

    executeStepFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cloudwatch:PutMetricData', 'xray:PutTraceSegments', 'xray:PutTelemetryRecords'],
        resources: ['*'],
      }),
    );

    const initializeRun = new tasks.LambdaInvoke(this, 'InitializeRun', {
      lambdaFunction: runInitializerFn,
      payload: sfn.TaskInput.fromObject({
        tenantId: sfn.JsonPath.stringAt('$.tenantId'),
        workflowId: sfn.JsonPath.stringAt('$.workflowId'),
        runId: sfn.JsonPath.stringAt('$.runId'),
        traceId: sfn.JsonPath.stringAt('$.traceId'),
        payload: sfn.JsonPath.objectAt('$.payload'),
      }),
      resultPath: '$.initResult',
      resultSelector: {
        'steps.$': '$.Payload.steps',
        'workflowId.$': '$.Payload.workflowId',
        'runId.$': '$.Payload.runId',
        'tenantId.$': '$.Payload.tenantId',
        'traceId.$': '$.Payload.traceId',
        'payload.$': '$.Payload.payload',
      },
    });
    initializeRun.addRetry({ maxAttempts: 2, interval: cdk.Duration.seconds(1) });

    const executeSingleStep = new tasks.LambdaInvoke(this, 'ExecuteStep', {
      lambdaFunction: executeStepFn,
      payload: sfn.TaskInput.fromObject({
        step: sfn.JsonPath.objectAt('$$.Map.Item.Value'),
        runId: sfn.JsonPath.stringAt('$.initResult.runId'),
        tenantId: sfn.JsonPath.stringAt('$.initResult.tenantId'),
        traceId: sfn.JsonPath.stringAt('$.initResult.traceId'),
        accumulatedContext: sfn.JsonPath.objectAt('$.accumulatedContext'),
      }),
      outputPath: '$.Payload',
    });

    const executeSteps = new sfn.Map(this, 'ExecuteSteps', {
      itemsPath: sfn.JsonPath.stringAt('$.initResult.steps'),
      maxConcurrency: 1,
      resultPath: '$.stepResults',
    }).iterator(executeSingleStep);

    const finalizeRun = new tasks.LambdaInvoke(this, 'FinalizeRun', {
      lambdaFunction: runFinalizerFn,
      payload: sfn.TaskInput.fromObject({
        runId: sfn.JsonPath.stringAt('$.initResult.runId'),
        tenantId: sfn.JsonPath.stringAt('$.initResult.tenantId'),
        workflowId: sfn.JsonPath.stringAt('$.initResult.workflowId'),
        status: 'SUCCESS',
        stepResults: sfn.JsonPath.objectAt('$.stepResults'),
      }),
      outputPath: '$.Payload',
    });

    const handleStepFailure = new tasks.LambdaInvoke(this, 'HandleStepFailure', {
      lambdaFunction: runFinalizerFn,
      payload: sfn.TaskInput.fromObject({
        runId: sfn.JsonPath.stringAt('$.initResult.runId'),
        tenantId: sfn.JsonPath.stringAt('$.initResult.tenantId'),
        workflowId: sfn.JsonPath.stringAt('$.initResult.workflowId'),
        status: 'FAILED',
        error: sfn.JsonPath.objectAt('$.errorInfo'),
        stepResults: sfn.JsonPath.objectAt('$.stepResults'),
      }),
      outputPath: '$.Payload',
    });

    const failRun = new sfn.Fail(this, 'FailRun', {
      error: 'WorkflowRunFailed',
    });

    initializeRun.addCatch(failRun, { resultPath: '$.errorInfo' });
    executeSteps.addCatch(handleStepFailure, { resultPath: '$.errorInfo' });
    handleStepFailure.next(failRun);

    this.workflowRunnerStateMachine = new sfn.StateMachine(this, 'WorkflowRunnerStateMachine', {
      stateMachineName: 'courseforge-workflow-runner',
      definition: initializeRun.next(executeSteps).next(finalizeRun),
      tracingEnabled: true,
    });
    const workflowRunnerCfn = this.workflowRunnerStateMachine.node
      .defaultChild as sfn.CfnStateMachine;
    workflowRunnerCfn.addPropertyOverride('TimeoutSeconds', 3600);

    new events.Rule(this, 'RunFailureRule', {
      eventBus: props.eventBus,
      eventPattern: {
        source: ['courseforge.run'],
        detailType: ['RunFailed'],
      },
      targets: [new targets.LambdaFunction(notificationFn)],
    });

    new cdk.CfnOutput(this, 'WorkflowRunnerStateMachineArn', {
      value: this.workflowRunnerStateMachine.stateMachineArn,
    });
  }
}
