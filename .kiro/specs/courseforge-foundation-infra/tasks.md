# Implementation Plan: CourseForge Foundation Infrastructure

## Overview

Incrementally build the foundational AWS CDK infrastructure and shared type definitions for CourseForge Connect. The plan starts with shared types (no AWS dependencies), then scaffolds the CDK project, implements the FoundationStack resources, writes documentation, and wires everything together with tests.

## Tasks

- [x] 1. Create shared type definitions package
  - [x] 1.1 Scaffold `packages/types/` package
    - Create `packages/types/package.json` with name `@courseforge/types`, TypeScript as devDependency
    - Create `packages/types/tsconfig.json` extending strict settings, targeting ES2022
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 1.2 Implement DomainEvent interface and status enums
    - Create `packages/types/src/events.ts` with `DomainEvent` interface (tenantId, workflowId, eventType, payload: unknown, traceId, timestamp)
    - Add `WorkflowStatus` enum with DRAFT, PUBLISHED, PAUSED, ARCHIVED
    - Add `RunStatus` enum with PENDING, RUNNING, SUCCESS, FAILED, REPLAYING
    - Create `packages/types/src/index.ts` re-exporting all types and enums
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 1.3 Write unit tests for shared types
    - Create `packages/types/src/events.test.ts`
    - Verify `WorkflowStatus` has exactly DRAFT, PUBLISHED, PAUSED, ARCHIVED values
    - Verify `RunStatus` has exactly PENDING, RUNNING, SUCCESS, FAILED, REPLAYING values
    - Verify all types and enums are importable from `index.ts`
    - Create `packages/types/vitest.config.ts` scoped to `src/**/*.test.ts`
    - _Requirements: 6.2, 6.3, 6.4_

  - [x] 1.4 Write property test for DomainEvent serialization round trip
    - **Property 1: DomainEvent serialization round trip**
    - **Validates: Requirements 6.1**
    - Create `packages/types/src/events.property.test.ts`
    - Use `fast-check` to generate random DomainEvent instances
    - Assert `JSON.parse(JSON.stringify(event))` deeply equals the original
    - Minimum 100 iterations
    - Tag: `Feature: courseforge-foundation-infra, Property 1: DomainEvent serialization round trip`

- [x] 2. Checkpoint - Verify shared types
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Scaffold CDK infrastructure project
  - [x] 3.1 Create `infra/` package scaffolding
    - Create `infra/package.json` with `aws-cdk-lib`, `constructs` as dependencies, `vitest` and `typescript` as devDependencies
    - Create `infra/tsconfig.json` targeting ES2022, strict mode
    - Create `infra/cdk.json` with `app` pointing to `npx ts-node bin/app.ts`, placeholder context keys for `dev_account`, `dev_region`, `prod_account`, `prod_region`
    - Create `infra/vitest.config.ts` scoped to `test/**/*.test.ts`
    - _Requirements: 5.3, 5.7_

  - [x] 3.2 Create CDK app entry point
    - Create `infra/bin/app.ts`
    - Read `dev_account`, `dev_region`, `prod_account`, `prod_region` from CDK context with placeholder fallbacks
    - Instantiate `FoundationStack-dev` and `FoundationStack-prod` with respective env configs
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6_

- [x] 4. Implement FoundationStack resources
  - [x] 4.1 Create FoundationStack with EventBridge resources
    - Create `infra/lib/foundation-stack.ts` with `FoundationStack` class extending `cdk.Stack`
    - Add EventBridge event bus `courseforge-domain`
    - Add Schema Registry `courseforge-registry` via `CfnRegistry`
    - Add Schema Discoverer linking bus to registry via `CfnDiscoverer`
    - Export `EventBusArn` and `EventBusName` as CloudFormation outputs
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 5.5, 5.6_

  - [x] 4.2 Add DynamoDB table with GSIs
    - Add DynamoDB table `courseforge-main` with PK (String) and SK (String)
    - Set PAY_PER_REQUEST billing, enable PITR, AWS-managed KMS encryption
    - Add GSI `GSI_TENANT_STATUS` with PK=tenantId, SK=statusUpdatedAt
    - Add GSI `GSI_WORKFLOW_RUNS` with PK=workflowId, SK=startedAt
    - Export `MainTableName` and `MainTableArn` as CloudFormation outputs
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9_

  - [x] 4.3 Add S3 artifact bucket
    - Add S3 bucket `courseforge-artifacts-{account}-{region}`
    - Enable versioning, SSE-S3 encryption, block all public access
    - Add lifecycle rule: transition to INTELLIGENT_TIERING after 90 days
    - Export `ArtifactBucketName` as CloudFormation output
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 4.4 Add Secrets Manager placeholder secret
    - Add Secrets Manager secret `courseforge/connection-root`
    - Set placeholder value indicating IAM anchor purpose
    - _Requirements: 4.1, 4.2_

- [x] 5. Checkpoint - Verify CDK synthesis
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Write CDK infrastructure tests
  - [x] 6.1 Write CDK template assertion tests for EventBridge
    - Create `infra/test/foundation-stack.test.ts`
    - Synthesize FoundationStack and use `Template.fromStack()` assertions
    - Verify event bus name, schema registry, discoverer linkage, CloudFormation outputs
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 6.2 Write CDK template assertion tests for DynamoDB
    - Verify table name, key schema (PK/SK), billing mode, PITR, encryption
    - Verify GSI_TENANT_STATUS and GSI_WORKFLOW_RUNS definitions
    - Verify MainTableName and MainTableArn outputs
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9_

  - [x] 6.3 Write CDK template assertion tests for S3 and Secrets Manager
    - Verify bucket versioning, encryption, lifecycle rule, public access block, output
    - Verify secret name and placeholder value
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2_

- [x] 7. Write infrastructure documentation
  - [x] 7.1 Create `infra/README.md`
    - Document deployment steps for FoundationStack
    - Document CDK context variables (dev_account, prod_account) and expected format
    - Document DynamoDB single-table key schema (PK/SK patterns for Workflow and Run entities)
    - Document access patterns: get workflow by ID, list runs by workflow, list runs by tenant and status, get run by ID
    - Document Secrets Manager naming convention: `courseforge/tenant/{tenantId}/connection/{connectionId}`
    - _Requirements: 4.3, 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (DomainEvent round trip)
- CDK template assertion tests validate infrastructure resource configurations
