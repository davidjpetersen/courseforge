import * as cdk from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwIntegrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

export interface TriggerStackProps extends cdk.StackProps {
  eventBus: events.IEventBus;
  mainTable: dynamodb.ITable;
  workflowRunnerStateMachine?: sfn.IStateMachine;
}

export class TriggerStack extends cdk.Stack {
  public readonly schedulesTable: dynamodb.Table;
  public readonly webhookApi: apigwv2.HttpApi;
  public readonly webhookIngressFn: lambda.Function;
  public readonly scheduledTriggerFn: lambda.Function;
  public readonly workflowRunnerStateMachine: sfn.StateMachine;
  public readonly schedulerTargetRole: iam.Role;

  constructor(scope: Construct, id: string, props: TriggerStackProps) {
    super(scope, id, props);

    this.schedulesTable = new dynamodb.Table(this, 'SchedulesTable', {
      tableName: 'courseforge-schedules',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    new scheduler.CfnScheduleGroup(this, 'SchedulesGroup', {
      name: 'courseforge-schedules',
    });

    this.webhookIngressFn = new lambda.Function(this, 'WebhookIngressFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async () => ({ statusCode: 202, body: "{}" });'),
      timeout: cdk.Duration.seconds(10),
      environment: {
        EVENT_BUS_NAME: props.eventBus.eventBusName,
        MAIN_TABLE_NAME: props.mainTable.tableName,
      },
    });

    this.scheduledTriggerFn = new lambda.Function(this, 'ScheduledTriggerFn', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async () => undefined;'),
      timeout: cdk.Duration.seconds(10),
      environment: {
        EVENT_BUS_NAME: props.eventBus.eventBusName,
        MAIN_TABLE_NAME: props.mainTable.tableName,
        SCHEDULES_TABLE_NAME: this.schedulesTable.tableName,
      },
    });

    props.mainTable.grantReadWriteData(this.webhookIngressFn);
    props.mainTable.grantReadWriteData(this.scheduledTriggerFn);
    this.schedulesTable.grantReadWriteData(this.scheduledTriggerFn);
    props.eventBus.grantPutEventsTo(this.webhookIngressFn);
    props.eventBus.grantPutEventsTo(this.scheduledTriggerFn);

    this.webhookApi = new apigwv2.HttpApi(this, 'WebhookApi', {
      apiName: 'courseforge-webhook-api',
    });

    this.webhookApi.addRoutes({
      path: '/webhook/{workflowId}',
      methods: [apigwv2.HttpMethod.POST],
      integration: new apigwIntegrations.HttpLambdaIntegration(
        'WebhookIngressIntegration',
        this.webhookIngressFn,
      ),
    });

    const dlq = new sqs.Queue(this, 'TriggerDlq', {
      queueName: 'courseforge-trigger-dlq',
    });

    this.workflowRunnerStateMachine =
      props.workflowRunnerStateMachine ??
      new sfn.StateMachine(this, 'WorkflowRunnerSFN', {
        stateMachineName: 'courseforge-trigger-workflow-runner',
        definitionBody: sfn.DefinitionBody.fromChainable(new sfn.Pass(this, 'StartWorkflowRun')),
      });

    const triggerRule = new events.Rule(this, 'TriggerRoutingRule', {
      eventBus: props.eventBus,
      eventPattern: {
        source: ['courseforge.trigger'],
      },
    });

    triggerRule.addTarget(
      new targets.SfnStateMachine(this.workflowRunnerStateMachine, {
        deadLetterQueue: dlq,
      }),
    );

    this.schedulerTargetRole = new iam.Role(this, 'SchedulerTargetRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
    });
    this.scheduledTriggerFn.grantInvoke(this.schedulerTargetRole);

    new cdk.CfnOutput(this, 'WebhookBaseUrl', {
      value: this.webhookApi.apiEndpoint,
    });

    new cdk.CfnOutput(this, 'SchedulesTableName', {
      value: this.schedulesTable.tableName,
    });

    new cdk.CfnOutput(this, 'ScheduledTriggerTargetArn', {
      value: this.scheduledTriggerFn.functionArn,
    });

    new cdk.CfnOutput(this, 'ScheduledTriggerRoleArn', {
      value: this.schedulerTargetRole.roleArn,
    });
  }
}
