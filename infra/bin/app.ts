#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { FoundationStack } from '../lib/foundation-stack';

const app = new cdk.App();

const devAccount = app.node.tryGetContext('dev_account') ?? 'REPLACE_WITH_DEV_ACCOUNT';
const devRegion = app.node.tryGetContext('dev_region') ?? 'us-east-1';
const prodAccount = app.node.tryGetContext('prod_account') ?? 'REPLACE_WITH_PROD_ACCOUNT';
const prodRegion = app.node.tryGetContext('prod_region') ?? 'us-east-1';

new FoundationStack(app, 'FoundationStack-dev', {
  env: { account: devAccount, region: devRegion },
});

new FoundationStack(app, 'FoundationStack-prod', {
  env: { account: prodAccount, region: prodRegion },
});
