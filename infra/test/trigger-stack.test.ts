import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { FoundationStack } from '../lib/foundation-stack';
import { TriggerStack } from '../lib/trigger-stack';

function createTemplate(): Template {
  const app = new cdk.App();
  const foundation = new FoundationStack(app, 'Foundation', {});
  const trigger = new TriggerStack(app, 'Trigger', {
    eventBus: foundation.eventBus,
    mainTable: foundation.mainTable,
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
    template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
      StateMachineName: 'courseforge-trigger-workflow-runner',
    });
    template.hasResourceProperties('AWS::Events::Rule', {
      Targets: Match.arrayWith([
        Match.objectLike({
          Arn: {
            Ref: Match.anyValue(),
          },
        }),
      ]),
    });
  });

  it('exports the webhook base URL', () => {
    template.hasOutput('WebhookBaseUrl', {});
  });
});
