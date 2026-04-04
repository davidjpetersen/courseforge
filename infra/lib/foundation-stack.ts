import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventschemas from 'aws-cdk-lib/aws-eventschemas';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface FoundationStackProps extends cdk.StackProps {}

export class FoundationStack extends cdk.Stack {
  public readonly eventBus: events.IEventBus;
  public readonly eventBusArn: string;
  public readonly eventBusName: string;
  public readonly mainTable: dynamodb.ITable;
  public readonly mainTableName: string;
  public readonly mainTableArn: string;
  public readonly artifactBucketName: string;
  public readonly artifactBucket: s3.IBucket;

  constructor(scope: Construct, id: string, props: FoundationStackProps) {
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

    // Expose S3 properties
    this.artifactBucketName = artifactBucket.bucketName;
    this.artifactBucket = artifactBucket;

    // S3 CloudFormation output
    new cdk.CfnOutput(this, 'ArtifactBucketName', {
      value: artifactBucket.bucketName,
    });

    // Secrets Manager — IAM anchor for connection secrets
    new secretsmanager.Secret(this, 'ConnectionRootSecret', {
      secretName: 'courseforge/connection-root',
      secretStringValue: cdk.SecretValue.unsafePlainText(
        JSON.stringify({ purpose: 'IAM anchor for courseforge connection secrets' }),
      ),
    });
  }
}
