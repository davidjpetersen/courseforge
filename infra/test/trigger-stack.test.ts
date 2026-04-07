import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { describe, expect, it, vi } from 'vitest';

// Mock NodejsFunction to avoid esbuild bundling in the Vitest worker thread
vi.mock('aws-cdk-lib/aws-lambda-nodejs', async () => {
  class MockNodejsFunction extends lambda.Function {
    constructor(scope: cdk.App | cdk.Stack | cdk.NestedStack, id: string, props: any) {
      super(scope as any, id, {
        runtime: props.runtime ?? lambda.Runtime.NODEJS_20_X,
        handler: props.handler ?? 'index.handler',
        code: lambda.Code.fromInline('exports.handler = async () => undefined;'),
        timeout: props.timeout,
        memorySize: props.memorySize,
        environment: props.environment,
        tracing: props.tracing,
      });
    }
  }

  return {
    NodejsFunction: MockNodejsFunction,
    OutputFormat: {
      ESM: 'esm',
      CJS: 'cjs',
    },
  };
});

import { FoundationStack } from '../lib/foundation-stack';
import { OrchestrationStack } from '../lib/orchestration-stack';
import { TriggerStack } from '../lib/trigger-stack';

function createTemplate(): Template {
  const app = new cdk.App();
  const foundation = new FoundationStack(app, 'Foundation', {});
  const orchestration = new OrchestrationStack(app, 'Orchestration', {
    mainTable: foundation.mainTable,
    eventBus: foundation.eventBus,
    artifactBucket: foundation.artifactBucket,
  });
  const trigger = new TriggerStack(app, 'Trigger', {
    eventBus: foundation.eventBus,
    mainTable: foundation.mainTable,
    workflowRunnerStateMachine: orchestration.workflowRunnerStateMachine,
  });

  return Template.fromStack(trigger);
}

describe('TriggerStack', () => {
  const template = createTemplate();

  it('creates a webhook HTTP API named courseforge-webhook-api', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      Name: 'courseforge-webhook-api',
      ProtocolType: 'HTTP',
    });
  });

  it('creates a POST /webhook/{workflowId} route', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'POST /webhook/{workflowId}',
    });
  });

  it('creates the schedules table with PK/SK', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'courseforge-schedules',
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
    });
  });

  it('creates the scheduler group', () => {
    template.hasResourceProperties('AWS::Scheduler::ScheduleGroup', {
      Name: 'courseforge-schedules',
    });
  });

  it('creates an EventBridge rule for courseforge.trigger events', () => {
    template.hasResourceProperties('AWS::Events::Rule', {
      EventPattern: {
        source: ['courseforge.trigger'],
      },
    });
  });

  it('creates the trigger DLQ', () => {
    template.hasResourceProperties('AWS::SQS::Queue', {
      QueueName: 'courseforge-trigger-dlq',
    });
  });

  it('creates lambda functions with 10 second timeout', () => {
    template.resourceCountIs('AWS::Lambda::Function', 2);
    template.hasResourceProperties('AWS::Lambda::Function', {
      Timeout: 10,
    });
  });

  it('targets a Step Functions state machine from the routing rule', () => {
    template.hasResourceProperties('AWS::Events::Rule', {
      Targets: Match.arrayWith([
        Match.objectLike({
          Arn: Match.anyValue(),
        }),
      ]),
    });
  });

  it('exports the webhook base URL', () => {
    template.hasOutput('WebhookBaseUrl', {});
  });
});
