import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, it } from 'vitest';

import { FoundationStack } from '../lib/foundation-stack';
import { OrchestrationStack } from '../lib/orchestration-stack';

describe('OrchestrationStack', () => {
  it('creates the workflow runner with tracing and a 1 hour timeout', () => {
    const app = new cdk.App();
    const foundation = new FoundationStack(app, 'Foundation', {});
    const orchestration = new OrchestrationStack(app, 'Orchestration', {
      eventBus: foundation.eventBus,
      mainTable: foundation.mainTable,
      artifactBucket: foundation.artifactBucket,
    });

    const template = Template.fromStack(orchestration);
    template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
      StateMachineName: 'courseforge-workflow-runner',
      TracingConfiguration: { Enabled: true },
      TimeoutSeconds: 3600,
    });

    template.hasResourceProperties('AWS::Events::Rule', {
      EventPattern: {
        source: ['courseforge.run'],
        'detail-type': ['RunFailed'],
      },
    });
  });
});
