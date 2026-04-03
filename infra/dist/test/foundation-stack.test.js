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
function createTemplate() {
    const app = new cdk.App();
    const stack = new foundation_stack_1.FoundationStack(app, 'TestStack', {});
    return assertions_1.Template.fromStack(stack);
}
(0, vitest_1.describe)('FoundationStack - EventBridge', () => {
    const template = createTemplate();
    (0, vitest_1.it)('creates an event bus named courseforge-domain', () => {
        template.hasResourceProperties('AWS::Events::EventBus', {
            Name: 'courseforge-domain',
        });
    });
    (0, vitest_1.it)('creates a schema registry named courseforge-registry', () => {
        template.hasResourceProperties('AWS::EventSchemas::Registry', {
            RegistryName: 'courseforge-registry',
        });
    });
    (0, vitest_1.it)('creates a discoverer linked to the event bus', () => {
        template.hasResourceProperties('AWS::EventSchemas::Discoverer', {
            SourceArn: {
                'Fn::GetAtt': [
                    template.findResources('AWS::Events::EventBus', {
                        Properties: { Name: 'courseforge-domain' },
                    })
                        ? Object.keys(template.findResources('AWS::Events::EventBus', {
                            Properties: { Name: 'courseforge-domain' },
                        }))[0]
                        : '',
                    'Arn',
                ],
            },
        });
    });
    (0, vitest_1.it)('exports EventBusArn as a CloudFormation output', () => {
        template.hasOutput('EventBusArn', {});
    });
    (0, vitest_1.it)('exports EventBusName as a CloudFormation output', () => {
        template.hasOutput('EventBusName', {});
    });
});
(0, vitest_1.describe)('FoundationStack - DynamoDB', () => {
    const template = createTemplate();
    (0, vitest_1.it)('creates a table named courseforge-main', () => {
        template.hasResourceProperties('AWS::DynamoDB::Table', {
            TableName: 'courseforge-main',
        });
    });
    (0, vitest_1.it)('has PK (HASH) and SK (RANGE) key schema with String type', () => {
        template.hasResourceProperties('AWS::DynamoDB::Table', {
            KeySchema: [
                { AttributeName: 'PK', KeyType: 'HASH' },
                { AttributeName: 'SK', KeyType: 'RANGE' },
            ],
            AttributeDefinitions: assertions_1.Match.arrayWith([
                { AttributeName: 'PK', AttributeType: 'S' },
                { AttributeName: 'SK', AttributeType: 'S' },
            ]),
        });
    });
    (0, vitest_1.it)('uses PAY_PER_REQUEST billing mode', () => {
        template.hasResourceProperties('AWS::DynamoDB::Table', {
            BillingMode: 'PAY_PER_REQUEST',
        });
    });
    (0, vitest_1.it)('has point-in-time recovery enabled', () => {
        template.hasResourceProperties('AWS::DynamoDB::Table', {
            PointInTimeRecoverySpecification: {
                PointInTimeRecoveryEnabled: true,
            },
        });
    });
    (0, vitest_1.it)('uses AWS-managed KMS encryption', () => {
        template.hasResourceProperties('AWS::DynamoDB::Table', {
            SSESpecification: {
                SSEEnabled: true,
            },
        });
    });
    (0, vitest_1.it)('has GSI_TENANT_STATUS with PK=tenantId and SK=statusUpdatedAt', () => {
        template.hasResourceProperties('AWS::DynamoDB::Table', {
            GlobalSecondaryIndexes: assertions_1.Match.arrayWith([
                assertions_1.Match.objectLike({
                    IndexName: 'GSI_TENANT_STATUS',
                    KeySchema: [
                        { AttributeName: 'tenantId', KeyType: 'HASH' },
                        { AttributeName: 'statusUpdatedAt', KeyType: 'RANGE' },
                    ],
                }),
            ]),
        });
    });
    (0, vitest_1.it)('has GSI_WORKFLOW_RUNS with PK=workflowId and SK=startedAt', () => {
        template.hasResourceProperties('AWS::DynamoDB::Table', {
            GlobalSecondaryIndexes: assertions_1.Match.arrayWith([
                assertions_1.Match.objectLike({
                    IndexName: 'GSI_WORKFLOW_RUNS',
                    KeySchema: [
                        { AttributeName: 'workflowId', KeyType: 'HASH' },
                        { AttributeName: 'startedAt', KeyType: 'RANGE' },
                    ],
                }),
            ]),
        });
    });
    (0, vitest_1.it)('exports MainTableName as a CloudFormation output', () => {
        template.hasOutput('MainTableName', {});
    });
    (0, vitest_1.it)('exports MainTableArn as a CloudFormation output', () => {
        template.hasOutput('MainTableArn', {});
    });
});
(0, vitest_1.describe)('FoundationStack - S3', () => {
    const template = createTemplate();
    (0, vitest_1.it)('has versioning enabled', () => {
        template.hasResourceProperties('AWS::S3::Bucket', {
            VersioningConfiguration: {
                Status: 'Enabled',
            },
        });
    });
    (0, vitest_1.it)('uses SSE-S3 encryption', () => {
        template.hasResourceProperties('AWS::S3::Bucket', {
            BucketEncryption: {
                ServerSideEncryptionConfiguration: assertions_1.Match.arrayWith([
                    assertions_1.Match.objectLike({
                        ServerSideEncryptionByDefault: {
                            SSEAlgorithm: 'AES256',
                        },
                    }),
                ]),
            },
        });
    });
    (0, vitest_1.it)('transitions objects to INTELLIGENT_TIERING after 90 days', () => {
        template.hasResourceProperties('AWS::S3::Bucket', {
            LifecycleConfiguration: {
                Rules: assertions_1.Match.arrayWith([
                    assertions_1.Match.objectLike({
                        Transitions: assertions_1.Match.arrayWith([
                            assertions_1.Match.objectLike({
                                StorageClass: 'INTELLIGENT_TIERING',
                                TransitionInDays: 90,
                            }),
                        ]),
                    }),
                ]),
            },
        });
    });
    (0, vitest_1.it)('blocks all public access', () => {
        template.hasResourceProperties('AWS::S3::Bucket', {
            PublicAccessBlockConfiguration: {
                BlockPublicAcls: true,
                BlockPublicPolicy: true,
                IgnorePublicAcls: true,
                RestrictPublicBuckets: true,
            },
        });
    });
    (0, vitest_1.it)('exports ArtifactBucketName as a CloudFormation output', () => {
        template.hasOutput('ArtifactBucketName', {});
    });
});
(0, vitest_1.describe)('FoundationStack - Secrets Manager', () => {
    const template = createTemplate();
    (0, vitest_1.it)('creates a secret named courseforge/connection-root', () => {
        template.hasResourceProperties('AWS::SecretsManager::Secret', {
            Name: 'courseforge/connection-root',
        });
    });
    (0, vitest_1.it)('has a placeholder value indicating IAM anchor purpose', () => {
        template.hasResourceProperties('AWS::SecretsManager::Secret', {
            SecretString: assertions_1.Match.stringLikeRegexp('IAM anchor'),
        });
    });
});
//# sourceMappingURL=foundation-stack.test.js.map