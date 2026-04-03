import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, it, expect } from 'vitest';
import { FoundationStack } from '../lib/foundation-stack';

function createTemplate(): Template {
  const app = new cdk.App();
  const stack = new FoundationStack(app, 'TestStack', {});
  return Template.fromStack(stack);
}

describe('FoundationStack - EventBridge', () => {
  const template = createTemplate();

  it('creates an event bus named courseforge-domain', () => {
    template.hasResourceProperties('AWS::Events::EventBus', {
      Name: 'courseforge-domain',
    });
  });

  it('creates a schema registry named courseforge-registry', () => {
    template.hasResourceProperties('AWS::EventSchemas::Registry', {
      RegistryName: 'courseforge-registry',
    });
  });

  it('creates a discoverer linked to the event bus', () => {
    template.hasResourceProperties('AWS::EventSchemas::Discoverer', {
      SourceArn: {
        'Fn::GetAtt': [
          template.findResources('AWS::Events::EventBus', {
            Properties: { Name: 'courseforge-domain' },
          })
            ? Object.keys(
                template.findResources('AWS::Events::EventBus', {
                  Properties: { Name: 'courseforge-domain' },
                }),
              )[0]
            : '',
          'Arn',
        ],
      },
    });
  });

  it('exports EventBusArn as a CloudFormation output', () => {
    template.hasOutput('EventBusArn', {});
  });

  it('exports EventBusName as a CloudFormation output', () => {
    template.hasOutput('EventBusName', {});
  });
});

describe('FoundationStack - DynamoDB', () => {
  const template = createTemplate();

  it('creates a table named courseforge-main', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'courseforge-main',
    });
  });

  it('has PK (HASH) and SK (RANGE) key schema with String type', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      AttributeDefinitions: Match.arrayWith([
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' },
      ]),
    });
  });

  it('uses PAY_PER_REQUEST billing mode', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
    });
  });

  it('has point-in-time recovery enabled', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      PointInTimeRecoverySpecification: {
        PointInTimeRecoveryEnabled: true,
      },
    });
  });

  it('uses AWS-managed KMS encryption', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      SSESpecification: {
        SSEEnabled: true,
      },
    });
  });

  it('has GSI_TENANT_STATUS with PK=tenantId and SK=statusUpdatedAt', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({
          IndexName: 'GSI_TENANT_STATUS',
          KeySchema: [
            { AttributeName: 'tenantId', KeyType: 'HASH' },
            { AttributeName: 'statusUpdatedAt', KeyType: 'RANGE' },
          ],
        }),
      ]),
    });
  });

  it('has GSI_WORKFLOW_RUNS with PK=workflowId and SK=startedAt', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({
          IndexName: 'GSI_WORKFLOW_RUNS',
          KeySchema: [
            { AttributeName: 'workflowId', KeyType: 'HASH' },
            { AttributeName: 'startedAt', KeyType: 'RANGE' },
          ],
        }),
      ]),
    });
  });

  it('exports MainTableName as a CloudFormation output', () => {
    template.hasOutput('MainTableName', {});
  });

  it('exports MainTableArn as a CloudFormation output', () => {
    template.hasOutput('MainTableArn', {});
  });
});

describe('FoundationStack - S3', () => {
  const template = createTemplate();

  it('has versioning enabled', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      VersioningConfiguration: {
        Status: 'Enabled',
      },
    });
  });

  it('uses SSE-S3 encryption', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: Match.arrayWith([
          Match.objectLike({
            ServerSideEncryptionByDefault: {
              SSEAlgorithm: 'AES256',
            },
          }),
        ]),
      },
    });
  });

  it('transitions objects to INTELLIGENT_TIERING after 90 days', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      LifecycleConfiguration: {
        Rules: Match.arrayWith([
          Match.objectLike({
            Transitions: Match.arrayWith([
              Match.objectLike({
                StorageClass: 'INTELLIGENT_TIERING',
                TransitionInDays: 90,
              }),
            ]),
          }),
        ]),
      },
    });
  });

  it('blocks all public access', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it('exports ArtifactBucketName as a CloudFormation output', () => {
    template.hasOutput('ArtifactBucketName', {});
  });
});

describe('FoundationStack - Secrets Manager', () => {
  const template = createTemplate();

  it('creates a secret named courseforge/connection-root', () => {
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Name: 'courseforge/connection-root',
    });
  });

  it('has a placeholder value indicating IAM anchor purpose', () => {
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      SecretString: Match.stringLikeRegexp('IAM anchor'),
    });
  });
});
