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
exports.FoundationStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const dynamodb = __importStar(require("aws-cdk-lib/aws-dynamodb"));
const events = __importStar(require("aws-cdk-lib/aws-events"));
const eventschemas = __importStar(require("aws-cdk-lib/aws-eventschemas"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const secretsmanager = __importStar(require("aws-cdk-lib/aws-secretsmanager"));
class FoundationStack extends cdk.Stack {
    eventBus;
    eventBusArn;
    eventBusName;
    mainTable;
    mainTableName;
    mainTableArn;
    artifactBucket;
    artifactBucketName;
    constructor(scope, id, props) {
        super(scope, id, props);
        // EventBridge Event Bus
        const eventBus = new events.EventBus(this, 'DomainEventBus', {
            eventBusName: 'courseforge-domain',
        });
        this.eventBus = eventBus;
        // Schema Registry
        const registry = new eventschemas.CfnRegistry(this, 'SchemaRegistry', {
            registryName: 'courseforge-registry',
        });
        // Schema Discoverer — links the bus to the registry for auto-discovery
        new eventschemas.CfnDiscoverer(this, 'SchemaDiscoverer', {
            sourceArn: eventBus.eventBusArn,
        });
        // Expose as class properties
        this.eventBusArn = eventBus.eventBusArn;
        this.eventBusName = eventBus.eventBusName;
        // CloudFormation outputs
        new cdk.CfnOutput(this, 'EventBusArn', {
            value: eventBus.eventBusArn,
        });
        new cdk.CfnOutput(this, 'EventBusName', {
            value: eventBus.eventBusName,
        });
        // DynamoDB Single-Table
        const mainTable = new dynamodb.Table(this, 'MainTable', {
            tableName: 'courseforge-main',
            partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
            encryption: dynamodb.TableEncryption.AWS_MANAGED,
        });
        this.mainTable = mainTable;
        mainTable.addGlobalSecondaryIndex({
            indexName: 'GSI_TENANT_STATUS',
            partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'statusUpdatedAt', type: dynamodb.AttributeType.STRING },
        });
        mainTable.addGlobalSecondaryIndex({
            indexName: 'GSI_WORKFLOW_RUNS',
            partitionKey: { name: 'workflowId', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'startedAt', type: dynamodb.AttributeType.STRING },
        });
        // Expose DynamoDB properties
        this.mainTableName = mainTable.tableName;
        this.mainTableArn = mainTable.tableArn;
        // DynamoDB CloudFormation outputs
        new cdk.CfnOutput(this, 'MainTableName', {
            value: mainTable.tableName,
        });
        new cdk.CfnOutput(this, 'MainTableArn', {
            value: mainTable.tableArn,
        });
        // S3 Artifact Bucket
        const artifactBucket = new s3.Bucket(this, 'ArtifactBucket', {
            bucketName: `courseforge-artifacts-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
            versioned: true,
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            lifecycleRules: [
                {
                    transitions: [
                        {
                            storageClass: s3.StorageClass.INTELLIGENT_TIERING,
                            transitionAfter: cdk.Duration.days(90),
                        },
                    ],
                },
            ],
        });
        this.artifactBucket = artifactBucket;
        // Expose S3 properties
        this.artifactBucketName = artifactBucket.bucketName;
        // S3 CloudFormation output
        new cdk.CfnOutput(this, 'ArtifactBucketName', {
            value: artifactBucket.bucketName,
        });
        // Secrets Manager — IAM anchor for connection secrets
        new secretsmanager.Secret(this, 'ConnectionRootSecret', {
            secretName: 'courseforge/connection-root',
            secretStringValue: cdk.SecretValue.unsafePlainText(JSON.stringify({ purpose: 'IAM anchor for courseforge connection secrets' })),
        });
    }
}
exports.FoundationStack = FoundationStack;
//# sourceMappingURL=foundation-stack.js.map