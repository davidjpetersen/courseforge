#!/usr/bin/env node
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
const foundation_stack_1 = require("../lib/foundation-stack");
const orchestration_stack_1 = require("../lib/orchestration-stack");
const trigger_stack_1 = require("../lib/trigger-stack");
const app = new cdk.App();
const devAccount = app.node.tryGetContext('dev_account') ?? 'REPLACE_WITH_DEV_ACCOUNT';
const devRegion = app.node.tryGetContext('dev_region') ?? 'us-east-1';
const prodAccount = app.node.tryGetContext('prod_account') ?? 'REPLACE_WITH_PROD_ACCOUNT';
const prodRegion = app.node.tryGetContext('prod_region') ?? 'us-east-1';
const devFoundation = new foundation_stack_1.FoundationStack(app, 'FoundationStack-dev', {
    env: { account: devAccount, region: devRegion },
});
const devOrchestration = new orchestration_stack_1.OrchestrationStack(app, 'OrchestrationStack-dev', {
    env: { account: devAccount, region: devRegion },
    eventBus: devFoundation.eventBus,
    mainTable: devFoundation.mainTable,
    artifactBucket: devFoundation.artifactBucket,
});
new trigger_stack_1.TriggerStack(app, 'TriggerStack-dev', {
    env: { account: devAccount, region: devRegion },
    eventBus: devFoundation.eventBus,
    mainTable: devFoundation.mainTable,
    workflowRunnerStateMachine: devOrchestration.workflowRunnerStateMachine,
});
const prodFoundation = new foundation_stack_1.FoundationStack(app, 'FoundationStack-prod', {
    env: { account: prodAccount, region: prodRegion },
});
const prodOrchestration = new orchestration_stack_1.OrchestrationStack(app, 'OrchestrationStack-prod', {
    env: { account: prodAccount, region: prodRegion },
    eventBus: prodFoundation.eventBus,
    mainTable: prodFoundation.mainTable,
    artifactBucket: prodFoundation.artifactBucket,
});
new trigger_stack_1.TriggerStack(app, 'TriggerStack-prod', {
    env: { account: prodAccount, region: prodRegion },
    eventBus: prodFoundation.eventBus,
    mainTable: prodFoundation.mainTable,
    workflowRunnerStateMachine: prodOrchestration.workflowRunnerStateMachine,
});
//# sourceMappingURL=app.js.map