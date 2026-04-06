#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { FoundationStack } from '../lib/foundation-stack';
import { OrchestrationStack } from '../lib/orchestration-stack';
import { TriggerStack } from '../lib/trigger-stack';

const app = new cdk.App();

const devAccount = app.node.tryGetContext('dev_account') ?? 'REPLACE_WITH_DEV_ACCOUNT';
const devRegion = app.node.tryGetContext('dev_region') ?? 'us-east-1';
const prodAccount = app.node.tryGetContext('prod_account') ?? 'REPLACE_WITH_PROD_ACCOUNT';
const prodRegion = app.node.tryGetContext('prod_region') ?? 'us-east-1';

const devFoundation = new FoundationStack(app, 'FoundationStack-dev', {
  env: { account: devAccount, region: devRegion },
});
const devOrchestration = new OrchestrationStack(app, 'OrchestrationStack-dev', {
  env: { account: devAccount, region: devRegion },
  eventBus: devFoundation.eventBus,
  mainTable: devFoundation.mainTable,
  artifactBucket: devFoundation.artifactBucket,
});

new TriggerStack(app, 'TriggerStack-dev', {
  env: { account: devAccount, region: devRegion },
  eventBus: devFoundation.eventBus,
  mainTable: devFoundation.mainTable,
  workflowRunnerStateMachine: devOrchestration.workflowRunnerStateMachine,
});

const prodFoundation = new FoundationStack(app, 'FoundationStack-prod', {
  env: { account: prodAccount, region: prodRegion },
});
const prodOrchestration = new OrchestrationStack(app, 'OrchestrationStack-prod', {
  env: { account: prodAccount, region: prodRegion },
  eventBus: prodFoundation.eventBus,
  mainTable: prodFoundation.mainTable,
  artifactBucket: prodFoundation.artifactBucket,
});

new TriggerStack(app, 'TriggerStack-prod', {
  env: { account: prodAccount, region: prodRegion },
  eventBus: prodFoundation.eventBus,
  mainTable: prodFoundation.mainTable,
  workflowRunnerStateMachine: prodOrchestration.workflowRunnerStateMachine,
});
