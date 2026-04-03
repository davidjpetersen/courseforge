# Requirements Document

## Introduction

CourseForge Connect is an event-driven learning operations integration platform. This specification defines the foundational AWS infrastructure layer provisioned via AWS CDK v2 in TypeScript. The stack includes a custom EventBridge event bus with schema discovery, a single-table DynamoDB design for workflow registry and run indexing, an S3 artifact bucket with lifecycle policies, a Secrets Manager anchor secret, a CDK pipeline skeleton for multi-environment deployment, and shared TypeScript type definitions. No application logic is included — this is infrastructure only.

## Glossary

- **FoundationStack**: The primary AWS CDK stack that provisions all foundational infrastructure resources for CourseForge Connect.
- **Event_Bus**: The custom Amazon EventBridge event bus named "courseforge-domain" used for domain event routing.
- **Schema_Registry**: The EventBridge Schema Registry named "courseforge-registry" that auto-discovers event schemas from the Event_Bus.
- **Main_Table**: The single Amazon DynamoDB table named "courseforge-main" using a single-table design with composite keys (PK/SK) for workflow registry and run index data.
- **Artifact_Bucket**: The Amazon S3 bucket named "courseforge-artifacts-{account}-{region}" used for storing workflow artifacts.
- **Connection_Root_Secret**: The AWS Secrets Manager secret named "courseforge/connection-root" serving as the IAM anchor for runtime connection secrets.
- **CDK_App**: The CDK application entry point at `/infra/bin/app.ts` that instantiates FoundationStack for dev and prod environments.
- **DomainEvent**: A TypeScript interface representing a domain event with tenantId, workflowId, eventType, payload, traceId, and timestamp fields.
- **WorkflowStatus**: A TypeScript enum representing workflow lifecycle states: DRAFT, PUBLISHED, PAUSED, ARCHIVED.
- **RunStatus**: A TypeScript enum representing workflow run states: PENDING, RUNNING, SUCCESS, FAILED, REPLAYING.

## Requirements

### Requirement 1: Custom EventBridge Event Bus

**User Story:** As a platform operator, I want a dedicated EventBridge event bus for domain events, so that CourseForge Connect event routing is isolated from the default bus.

#### Acceptance Criteria

1. THE FoundationStack SHALL create an Event_Bus resource with the name "courseforge-domain".
2. THE FoundationStack SHALL create a Schema_Registry resource with the name "courseforge-registry".
3. THE FoundationStack SHALL enable schema auto-discovery on the Event_Bus using the Schema_Registry as the target registry.
4. THE FoundationStack SHALL export the Event_Bus ARN as a CloudFormation output named "EventBusArn".
5. THE FoundationStack SHALL export the Event_Bus name as a CloudFormation output named "EventBusName".

### Requirement 2: DynamoDB Single-Table Design

**User Story:** As a platform developer, I want a single DynamoDB table with composite keys and GSIs, so that I can store workflow definitions and run records with efficient access patterns.

#### Acceptance Criteria

1. THE FoundationStack SHALL create a Main_Table resource with the name "courseforge-main".
2. THE Main_Table SHALL use a partition key named "PK" of type String and a sort key named "SK" of type String.
3. THE Main_Table SHALL use PAY_PER_REQUEST billing mode.
4. THE Main_Table SHALL have point-in-time recovery enabled.
5. THE Main_Table SHALL use AWS-managed KMS key encryption.
6. THE Main_Table SHALL include a Global Secondary Index named "GSI_TENANT_STATUS" with partition key "tenantId" (String) and sort key "statusUpdatedAt" (String).
7. THE Main_Table SHALL include a Global Secondary Index named "GSI_WORKFLOW_RUNS" with partition key "workflowId" (String) and sort key "startedAt" (String).
8. THE FoundationStack SHALL export the Main_Table name as a CloudFormation output named "MainTableName".
9. THE FoundationStack SHALL export the Main_Table ARN as a CloudFormation output named "MainTableArn".

### Requirement 3: S3 Artifact Bucket

**User Story:** As a platform operator, I want a versioned, encrypted S3 bucket for workflow artifacts, so that artifacts are durable, cost-optimized, and secure.

#### Acceptance Criteria

1. THE FoundationStack SHALL create an Artifact_Bucket with the name pattern "courseforge-artifacts-{account}-{region}" where {account} is the AWS account ID and {region} is the AWS region.
2. THE Artifact_Bucket SHALL have versioning enabled.
3. THE Artifact_Bucket SHALL use SSE-S3 as the default server-side encryption.
4. THE Artifact_Bucket SHALL have a lifecycle rule that transitions objects older than 90 days to the INTELLIGENT_TIERING storage class.
5. THE Artifact_Bucket SHALL block all public access.
6. THE FoundationStack SHALL export the Artifact_Bucket name as a CloudFormation output named "ArtifactBucketName".

### Requirement 4: Secrets Manager IAM Anchor

**User Story:** As a platform developer, I want a root placeholder secret in Secrets Manager, so that IAM policies can reference a known secret path prefix for runtime connection secrets.

#### Acceptance Criteria

1. THE FoundationStack SHALL create a Connection_Root_Secret with the name "courseforge/connection-root".
2. THE Connection_Root_Secret SHALL contain a placeholder string value indicating it is an IAM anchor.
3. THE FoundationStack SHALL document in `/infra/README.md` that runtime secrets follow the naming convention "courseforge/tenant/{tenantId}/connection/{connectionId}".

### Requirement 5: CDK Pipeline Skeleton

**User Story:** As a DevOps engineer, I want a CDK app entry point that instantiates the FoundationStack for dev and prod environments, so that I can deploy infrastructure to multiple accounts from a single codebase.

#### Acceptance Criteria

1. THE CDK_App SHALL instantiate a FoundationStack for the dev environment using account and region values from the CDK context key "dev_account".
2. THE CDK_App SHALL instantiate a FoundationStack for the prod environment using account and region values from the CDK context key "prod_account".
3. THE CDK_App SHALL be located at `/infra/bin/app.ts`.
4. WHEN the CDK context keys "dev_account" or "prod_account" are not provided, THE CDK_App SHALL use placeholder values that clearly indicate configuration is required.
5. THE FoundationStack SHALL be located at `/infra/lib/foundation-stack.ts`.
6. THE FoundationStack SHALL accept environment (account and region) as a constructor parameter.
7. A `cdk.json` file SHALL exist at `/infra/cdk.json` with placeholder context keys for "dev_account" and "prod_account".

### Requirement 6: Shared Type Definitions

**User Story:** As a platform developer, I want shared TypeScript interfaces and enums for domain events and status values, so that all services use consistent type contracts.

#### Acceptance Criteria

1. THE DomainEvent interface SHALL be defined in `/packages/types/src/events.ts` with fields: tenantId (string), workflowId (string), eventType (string), payload (unknown), traceId (string), and timestamp (string).
2. THE WorkflowStatus enum SHALL be defined in `/packages/types/src/events.ts` with values: DRAFT, PUBLISHED, PAUSED, ARCHIVED.
3. THE RunStatus enum SHALL be defined in `/packages/types/src/events.ts` with values: PENDING, RUNNING, SUCCESS, FAILED, REPLAYING.
4. THE `/packages/types/src/index.ts` file SHALL re-export all types and enums from `events.ts`.

### Requirement 7: Infrastructure Documentation

**User Story:** As a platform operator, I want a README documenting deployment steps, context variables, and the DynamoDB key schema, so that new team members can understand and deploy the infrastructure.

#### Acceptance Criteria

1. THE `/infra/README.md` SHALL document the deployment steps for the FoundationStack.
2. THE `/infra/README.md` SHALL document the required CDK context variables ("dev_account", "prod_account") and their expected format.
3. THE `/infra/README.md` SHALL document the DynamoDB single-table key schema including PK and SK patterns.
4. THE `/infra/README.md` SHALL document the following access patterns: get workflow by ID, list runs by workflow, list runs by tenant and status, get run by ID.
5. THE `/infra/README.md` SHALL document the Secrets Manager naming convention for runtime secrets: "courseforge/tenant/{tenantId}/connection/{connectionId}".
