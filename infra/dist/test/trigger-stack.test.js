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
const cdk = __importStar(require("aws-cdk-lib"));
const assertions_1 = require("aws-cdk-lib/assertions");
const vitest_1 = require("vitest");
const foundation_stack_1 = require("../lib/foundation-stack");
const orchestration_stack_1 = require("../lib/orchestration-stack");
const trigger_stack_1 = require("../lib/trigger-stack");
function createTemplate() {
    const app = new cdk.App();
    const foundation = new foundation_stack_1.FoundationStack(app, 'Foundation', {});
    const orchestration = new orchestration_stack_1.OrchestrationStack(app, 'Orchestration', {
        mainTable: foundation.mainTable,
        eventBus: foundation.eventBus,
        artifactBucket: foundation.artifactBucket,
    });
    const trigger = new trigger_stack_1.TriggerStack(app, 'Trigger', {
        eventBus: foundation.eventBus,
        mainTable: foundation.mainTable,
        workflowRunnerStateMachine: orchestration.workflowRunnerStateMachine,
    });
    return assertions_1.Template.fromStack(trigger);
}
(0, vitest_1.describe)('TriggerStack', () => {
    const template = createTemplate();
    (0, vitest_1.it)('creates a webhook HTTP API named courseforge-webhook-api', () => {
        template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
            Name: 'courseforge-webhook-api',
            ProtocolType: 'HTTP',
        });
    });
    (0, vitest_1.it)('creates a POST /webhook/{workflowId} route', () => {
        template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
            RouteKey: 'POST /webhook/{workflowId}',
        });
    });
    (0, vitest_1.it)('creates the schedules table with PK/SK', () => {
        template.hasResourceProperties('AWS::DynamoDB::Table', {
            TableName: 'courseforge-schedules',
            KeySchema: [
                { AttributeName: 'PK', KeyType: 'HASH' },
                { AttributeName: 'SK', KeyType: 'RANGE' },
            ],
        });
    });
    (0, vitest_1.it)('creates the scheduler group', () => {
        template.hasResourceProperties('AWS::Scheduler::ScheduleGroup', {
            Name: 'courseforge-schedules',
        });
    });
    (0, vitest_1.it)('creates an EventBridge rule for courseforge.trigger events', () => {
        template.hasResourceProperties('AWS::Events::Rule', {
            EventPattern: {
                source: ['courseforge.trigger'],
            },
        });
    });
    (0, vitest_1.it)('creates the trigger DLQ', () => {
        template.hasResourceProperties('AWS::SQS::Queue', {
            QueueName: 'courseforge-trigger-dlq',
        });
    });
    (0, vitest_1.it)('creates lambda functions with 10 second timeout', () => {
        template.resourceCountIs('AWS::Lambda::Function', 2);
        template.hasResourceProperties('AWS::Lambda::Function', {
            Timeout: 10,
        });
    });
    (0, vitest_1.it)('targets a Step Functions state machine from the routing rule', () => {
        template.hasResourceProperties('AWS::Events::Rule', {
            Targets: assertions_1.Match.arrayWith([
                assertions_1.Match.objectLike({
                    Arn: assertions_1.Match.anyValue(),
                }),
            ]),
        });
    });
    (0, vitest_1.it)('exports the webhook base URL', () => {
        template.hasOutput('WebhookBaseUrl', {});
    });
});
//# sourceMappingURL=trigger-stack.test.js.map