import * as fs from 'node:fs';
import * as path from 'node:path';

import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';

export interface OrchestrationStackProps extends cdk.StackProps {
  mainTable: dynamodb.ITable;
  artifactBucket: s3.IBucket;
  eventBus: events.IEventBus;
}

function resolveFunctionEntry(...parts: string[]): string {
  const candidates = [
    path.resolve(process.cwd(), ...parts),
    path.resolve(process.cwd(), '..', ...parts),
    path.resolve(__dirname, '..', '..', '..', ...parts),
    path.resolve(__dirname, '..', '..', ...parts),
  ];

  const entry = candidates.find((candidate) => fs.existsSync(candidate));
  if (!entry) {
    throw new Error(`Unable to resolve function entry for ${parts.join('/')}`);
  }

  return entry;
}

function createNodejsFunction(
  scope: Construct,
  id: string,
  entry: string,
  props: Omit<lambdaNodejs.NodejsFunctionProps, 'entry' | 'runtime' | 'handler'>,
): lambdaNodejs.NodejsFunction {
  return new lambdaNodejs.NodejsFunction(scope, id, {
    entry: resolveFunctionEntry(entry),
    handler: 'handler',
    runtime: lambda.Runtime.NODEJS_20_X,
    bundling: {
      target: 'node20',
      format: lambdaNodejs.OutputFormat.ESM,
    },
    ...props,
  });
}

export class OrchestrationStack extends cdk.Stack {
  public readonly workflowRunnerStateMachine: sfn.StateMachine;
  public readonly runInitializerFn: lambda.Function;
  public readonly executeStepFn: lambda.Function;
  public readonly runFinalizerFn: lambda.Function;
  public readonly notificationFn: lambda.Function;

  constructor(scope: Construct, id: string, props: OrchestrationStackProps) {
    super(scope, id, props);

    this.runInitializerFn = createNodejsFunction(this, 'RunInitializerFn', 'functions/run-initializer/handler.ts', {
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        MAIN_TABLE_NAME: props.mainTable.tableName,
      },
      tracing: lambda.Tracing.ACTIVE,
    });

    this.executeStepFn = createNodejsFunction(this, 'ExecuteStepFn', 'functions/execute-step/handler.ts', {
      timeout: cdk.Duration.minutes(5),
      memorySize: 512,
      environment: {
        MAIN_TABLE_NAME: props.mainTable.tableName,
        ARTIFACT_BUCKET_NAME: props.artifactBucket.bucketName,
      },
      tracing: lambda.Tracing.ACTIVE,
    });

    this.runFinalizerFn = createNodejsFunction(this, 'RunFinalizerFn', 'functions/run-finalizer/handler.ts', {
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        MAIN_TABLE_NAME: props.mainTable.tableName,
        EVENT_BUS_NAME: props.eventBus.eventBusName,
      },
      tracing: lambda.Tracing.ACTIVE,
    });

    this.notificationFn = createNodejsFunction(this, 'NotificationFn', 'functions/notification/handler.ts', {
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

    const seedExecutionState = new sfn.Pass(this, 'SeedExecutionState', {
      parameters: {
        'initResult.$': '$.initResult',
        execution: {
          'steps.$': '$.initResult.steps',
          'totalSteps.$': 'States.ArrayLength($.initResult.steps)',
          currentStepIndex: 0,
          'currentContext.$': '$.initResult.payload',
        },
      },
    });

    const executeStepTask = new tasks.LambdaInvoke(this, 'ExecuteStep', {
      lambdaFunction: this.executeStepFn,
      resultPath: '$.execution.lastStepResult',
      payloadResponseOnly: true,
      payload: sfn.TaskInput.fromObject({
        'step.$': 'States.ArrayGetItem($.execution.steps, $.execution.currentStepIndex)',
        'runId.$': '$.initResult.runId',
        'tenantId.$': '$.initResult.tenantId',
        'traceId.$': '$.initResult.traceId',
        'accumulatedContext.$': '$.execution.currentContext',
      }),
    });

    const advanceExecutionState = new sfn.Pass(this, 'AdvanceExecutionState', {
      parameters: {
        'initResult.$': '$.initResult',
        execution: {
          'steps.$': '$.execution.steps',
          'totalSteps.$': '$.execution.totalSteps',
          'currentStepIndex.$': 'States.MathAdd($.execution.currentStepIndex, 1)',
          'currentContext.$': '$.execution.lastStepResult.accumulatedContext',
        },
      },
    });

    const executeSteps = new sfn.Choice(this, 'ExecuteSteps');

    const finalizeRun = new tasks.LambdaInvoke(this, 'FinalizeRun', {
      lambdaFunction: this.runFinalizerFn,
      payloadResponseOnly: true,
      payload: sfn.TaskInput.fromObject({
        'runId.$': '$.initResult.runId',
        'tenantId.$': '$.initResult.tenantId',
        'workflowId.$': '$.initResult.workflowId',
        status: 'SUCCESS',
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
    executeStepTask.addCatch(handleStepFailure, { resultPath: '$.stepFailure' });

    executeSteps.when(
      sfn.Condition.numberLessThanJsonPath(
        '$.execution.currentStepIndex',
        '$.execution.totalSteps',
      ),
      executeStepTask.next(advanceExecutionState).next(executeSteps),
    );
    executeSteps.otherwise(finalizeRun);

    const definition = initializeRun.next(seedExecutionState).next(executeSteps);
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
