import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { FoundationStack } from '../lib/foundation-stack';
import { OrchestrationStack } from '../lib/orchestration-stack';

function createTemplate(): Template {
  const app = new cdk.App();
  const foundation = new FoundationStack(app, 'Foundation', {});
  const stack = new OrchestrationStack(app, 'Orchestration', {
    mainTable: foundation.mainTable,
    eventBus: foundation.eventBus,
    artifactBucket: foundation.artifactBucket,
  });

  return Template.fromStack(stack);
}

describe('OrchestrationStack', () => {
  const template = createTemplate();

  it('creates the workflow runner with tracing and one-hour timeout', () => {
    template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
      StateMachineName: 'courseforge-workflow-runner',
      TracingConfiguration: { Enabled: true },
      DefinitionString: Match.anyValue(),
    });

    const serializedTemplate = JSON.stringify(
      template.findResources('AWS::StepFunctions::StateMachine'),
    );
    expect(serializedTemplate).toContain('InitializeRun');
    expect(serializedTemplate).toContain('ExecuteSteps');
    expect(serializedTemplate).toContain('FinalizeRun');
    expect(serializedTemplate).toContain('HandleStepFailure');
    expect(serializedTemplate).toContain('FailRun');
  });

  it('creates a rule for RunFailed events targeting notification lambda', () => {
    template.hasResourceProperties('AWS::Events::Rule', {
      EventPattern: {
        source: ['courseforge.run'],
        'detail-type': ['RunFailed'],
      },
      Targets: Match.arrayWith([Match.objectLike({ Arn: Match.anyValue() })]),
    });
  });

  it('exports the workflow runner ARN', () => {
    template.hasOutput('WorkflowRunnerStateMachineArn', {});
  });
});
