"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TriggerStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const apigwv2 = __importStar(require("aws-cdk-lib/aws-apigatewayv2"));
const apigwIntegrations = __importStar(require("aws-cdk-lib/aws-apigatewayv2-integrations"));
const dynamodb = __importStar(require("aws-cdk-lib/aws-dynamodb"));
const events = __importStar(require("aws-cdk-lib/aws-events"));
const targets = __importStar(require("aws-cdk-lib/aws-events-targets"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const scheduler = __importStar(require("aws-cdk-lib/aws-scheduler"));
const sqs = __importStar(require("aws-cdk-lib/aws-sqs"));
class TriggerStack extends cdk.Stack {
    schedulesTable;
    webhookApi;
    webhookIngressFn;
    scheduledTriggerFn;
    schedulerTargetRole;
    constructor(scope, id, props) {
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
            integration: new apigwIntegrations.HttpLambdaIntegration('WebhookIngressIntegration', this.webhookIngressFn),
        });
        const dlq = new sqs.Queue(this, 'TriggerDlq', {
            queueName: 'courseforge-trigger-dlq',
        });
        const triggerRule = new events.Rule(this, 'TriggerRoutingRule', {
            eventBus: props.eventBus,
            eventPattern: {
                source: ['courseforge.trigger'],
            },
        });
        triggerRule.addTarget(new targets.SfnStateMachine(props.workflowRunnerStateMachine, {
            deadLetterQueue: dlq,
        }));
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
exports.TriggerStack = TriggerStack;
//# sourceMappingURL=trigger-stack.js.map