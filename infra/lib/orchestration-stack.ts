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
  mainTable: dynamodb.ITable;
  artifactBucket: s3.IBucket;
  eventBus: events.IEventBus;
}

function inlineLambdaCode(name: string): lambda.Code {
  return lambda.Code.fromInline(`exports.handler = async (event) => ({ stub: '${name}', event });`);
}

export class OrchestrationStack extends cdk.Stack {
  public readonly workflowRunnerStateMachine: sfn.StateMachine;
  public readonly runInitializerFn: lambda.Function;
  public readonly executeStepFn: lambda.Function;
  public readonly runFinalizerFn: lambda.Function;
  public readonly notificationFn: lambda.Function;

  constructor(scope: Construct, id: string, props: OrchestrationStackProps) {
    super(scope, id, props);

    this.runInitializerFn = new lambda.Function(this, 'RunInitializerFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: inlineLambdaCode('RunInitializerFn'),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        MAIN_TABLE_NAME: props.mainTable.tableName,
      },
      tracing: lambda.Tracing.ACTIVE,
    });

    this.executeStepFn = new lambda.Function(this, 'ExecuteStepFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: inlineLambdaCode('ExecuteStepFn'),
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        MAIN_TABLE_NAME: props.mainTable.tableName,
        ARTIFACT_BUCKET_NAME: props.artifactBucket.bucketName,
      },
      tracing: lambda.Tracing.ACTIVE,
    });

    this.runFinalizerFn = new lambda.Function(this, 'RunFinalizerFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: inlineLambdaCode('RunFinalizerFn'),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        MAIN_TABLE_NAME: props.mainTable.tableName,
        EVENT_BUS_NAME: props.eventBus.eventBusName,
      },
      tracing: lambda.Tracing.ACTIVE,
    });

    this.notificationFn = new lambda.Function(this, 'NotificationFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: inlineLambdaCode('NotificationFn'),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        MAIN_TABLE_NAME: props.mainTable.tableName,
      },
      tracing: lambda.Tracing.ACTIVE,
    });

    props.mainTable.grantReadWriteData(this.runInitializerFn);
    props.mainTable.grantReadWriteData(this.executeStepFn);
    props.mainTable.grantReadWriteData(this.runFinalizerFn);
    props.mainTable.grantReadWriteData(this.notificationFn);
    props.artifactBucket.grantReadWrite(this.executeStepFn);
    props.eventBus.grantPutEventsTo(this.runFinalizerFn);

    this.executeStepFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cloudwatch:PutMetricData', 'xray:PutTraceSegments', 'xray:PutTelemetryRecords'],
        resources: ['*'],
      }),
    );

    const initializeRun = new tasks.LambdaInvoke(this, 'InitializeRun', {
      lambdaFunction: this.runInitializerFn,
      resultPath: '$.initResult',
      payloadResponseOnly: true,
    }).addRetry({
      interval: cdk.Duration.seconds(1),
      maxAttempts: 2,
    });

    const executeStepTask = new tasks.LambdaInvoke(this, 'ExecuteStep', {
      lambdaFunction: this.executeStepFn,
      payloadResponseOnly: true,
      payload: sfn.TaskInput.fromObject({
        'step.$': '$.Map.Item.Value',
        'runId.$': '$.initResult.runId',
        'tenantId.$': '$.initResult.tenantId',
        'traceId.$': '$.initResult.traceId',
        'accumulatedContext.$': '$.initResult.payload',
      }),
    });

    const executeSteps = new sfn.Map(this, 'ExecuteSteps', {
      itemsPath: sfn.JsonPath.stringAt('$.initResult.steps'),
      maxConcurrency: 1,
      resultPath: '$.stepResults',
    });
    executeSteps.itemProcessor(executeStepTask);

    const finalizeRun = new tasks.LambdaInvoke(this, 'FinalizeRun', {
      lambdaFunction: this.runFinalizerFn,
      payloadResponseOnly: true,
      payload: sfn.TaskInput.fromObject({
        'runId.$': '$.initResult.runId',
        'tenantId.$': '$.initResult.tenantId',
        'workflowId.$': '$.initResult.workflowId',
        status: 'SUCCESS',
        'stepResults.$': '$.stepResults',
      }),
    });

    const handleStepFailure = new tasks.LambdaInvoke(this, 'HandleStepFailure', {
      lambdaFunction: this.runFinalizerFn,
      payloadResponseOnly: true,
      payload: sfn.TaskInput.fromObject({
        'runId.$': '$.initResult.runId',
        'tenantId.$': '$.initResult.tenantId',
        'workflowId.$': '$.initResult.workflowId',
        status: 'FAILED',
        error: {
          'failedStepId.$': '$.stepFailure.Cause',
          'errorMessage.$': '$.stepFailure.Error',
          errorCode: 'WorkflowStepFailed',
        },
      }),
    });

    const failRun = new sfn.Fail(this, 'FailRun', {
      error: 'WorkflowRunFailed',
      cause: 'Workflow execution failed',
    });

    initializeRun.addCatch(failRun);
    executeSteps.addCatch(handleStepFailure, { resultPath: '$.stepFailure' });

    const definition = initializeRun.next(executeSteps).next(finalizeRun);
    handleStepFailure.next(failRun);

    this.workflowRunnerStateMachine = new sfn.StateMachine(this, 'WorkflowRunner', {
      stateMachineName: 'courseforge-workflow-runner',
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      timeout: cdk.Duration.hours(1),
      tracingEnabled: true,
    });

    const runFailedRule = new events.Rule(this, 'RunFailedRule', {
      eventBus: props.eventBus,
      eventPattern: {
        source: ['courseforge.run'],
        detailType: ['RunFailed'],
      },
    });
    runFailedRule.addTarget(new targets.LambdaFunction(this.notificationFn));

    new cdk.CfnOutput(this, 'WorkflowRunnerStateMachineArn', {
      value: this.workflowRunnerStateMachine.stateMachineArn,
    });
  }
}
