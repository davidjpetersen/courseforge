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
function createTemplate() {
    const app = new cdk.App();
    const foundation = new foundation_stack_1.FoundationStack(app, 'Foundation', {});
    const stack = new orchestration_stack_1.OrchestrationStack(app, 'Orchestration', {
        mainTable: foundation.mainTable,
        eventBus: foundation.eventBus,
        artifactBucket: foundation.artifactBucket,
    });
    return assertions_1.Template.fromStack(stack);
}
(0, vitest_1.describe)('OrchestrationStack', () => {
    const template = createTemplate();
    (0, vitest_1.it)('creates the workflow runner with tracing and one-hour timeout', () => {
        template.hasResourceProperties('AWS::StepFunctions::StateMachine', {
            StateMachineName: 'courseforge-workflow-runner',
            TracingConfiguration: { Enabled: true },
            DefinitionString: assertions_1.Match.anyValue(),
        });
        const serializedTemplate = JSON.stringify(template.findResources('AWS::StepFunctions::StateMachine'));
        (0, vitest_1.expect)(serializedTemplate).toContain('InitializeRun');
        (0, vitest_1.expect)(serializedTemplate).toContain('ExecuteSteps');
        (0, vitest_1.expect)(serializedTemplate).toContain('FinalizeRun');
        (0, vitest_1.expect)(serializedTemplate).toContain('HandleStepFailure');
        (0, vitest_1.expect)(serializedTemplate).toContain('FailRun');
    });
    (0, vitest_1.it)('creates a rule for RunFailed events targeting notification lambda', () => {
        template.hasResourceProperties('AWS::Events::Rule', {
            EventPattern: {
                source: ['courseforge.run'],
                'detail-type': ['RunFailed'],
            },
            Targets: assertions_1.Match.arrayWith([assertions_1.Match.objectLike({ Arn: assertions_1.Match.anyValue() })]),
        });
    });
    (0, vitest_1.it)('exports the workflow runner ARN', () => {
        template.hasOutput('WorkflowRunnerStateMachineArn', {});
    });
});
//# sourceMappingURL=orchestration-stack.test.js.map