# Implementation Plan: Event Triggering & Routing

## Overview

Implement event triggering and routing for CourseForge Connect, adding webhook ingress, scheduled triggers, HTTP action connector, trigger management APIs, and supporting CDK infrastructure. All components use the existing handler factory pattern with dependency injection and TypeScript throughout.

## Tasks

- [x] 1. Extend domain types and data model
  - [x] 1.1 Add trigger-related types to `packages/types/src/events.ts`
    - Add `WebhookReceived` and `ScheduleTriggered` event type constants
    - Add `TriggerType` union type (`webhook` | `scheduled` | `manual`)
    - Export new types from `packages/types/src/index.ts`
    - _Requirements: 11.1, 11.2_

  - [x] 1.2 Add key builders and schema constants to `src/models/schema.ts`
    - Add `WEBHOOK_SECRET#` SK prefix and `webhookSecretSK(workflowId)` builder
    - Add `RUN#` SK prefix and `runSK(timestamp, runId)` builder
    - Add `WORKFLOW#` PK prefix and `schedulePK(workflowId)` builder for schedules table
    - Add `SCHEDULE#` SK prefix and `scheduleSK(scheduleId)` builder
    - Add `WF#` PK prefix and `workflowPK(workflowId)` builder
    - _Requirements: 4.2, 5.7, 9.5_

- [x] 2. Implement WebhookIngressFn Lambda handler
  - [x] 2.1 Create `functions/webhook-ingress/handler.ts`
    - Implement `createWebhookIngressHandler(deps: WebhookIngressDeps)` factory
    - Extract `workflowId` from path params, `tenantId` and bearer token from `Authorization` header
    - SHA-256 hash token and compare against stored hash in Main_Table
    - Verify workflow status is PUBLISHED
    - Parse request body as JSON
    - Generate `traceId` and `runId` (UUID v4)
    - PutEvents to EventBridge with source `courseforge.trigger`, detail-type `WebhookReceived`
    - PutItem run record to Main_Table
    - Return 202 with `{ runId, traceId }`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [x] 2.2 Write unit tests for WebhookIngressFn (`functions/webhook-ingress/handler.test.ts`)
    - Test valid authenticated request → 202 with runId and traceId
    - Test invalid bearer token → 401
    - Test missing Authorization header → 401
    - Test missing workflowId → 400
    - Test non-PUBLISHED workflow → 409
    - Test invalid JSON body → 400
    - Test DomainEvent published to EventBridge on success
    - Test Run_Record written to DynamoDB on success
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

  - [x] 2.3 Write property test: Webhook authentication correctness (`functions/webhook-ingress/handler.property.test.ts`)
    - **Property 1: Webhook authentication correctness**
    - **Validates: Requirements 4.2, 4.3**

  - [x] 2.4 Write property test: Non-PUBLISHED workflow rejection (`functions/webhook-ingress/handler.property.test.ts`)
    - **Property 2: Non-PUBLISHED workflow rejection (webhook)**
    - **Validates: Requirements 5.1, 5.2**

  - [x] 2.5 Write property test: Successful webhook processing produces complete outputs (`functions/webhook-ingress/handler.property.test.ts`)
    - **Property 3: Successful webhook processing produces complete outputs**
    - **Validates: Requirements 5.5, 5.6, 5.7, 5.8**

- [x] 3. Implement ScheduledTriggerFn Lambda handler
  - [x] 3.1 Create `functions/scheduled-trigger/handler.ts`
    - Implement `createScheduledTriggerHandler(deps: ScheduledTriggerDeps)` factory
    - Extract `workflowId`, `tenantId`, `scheduleId` from scheduler event payload
    - Verify workflow status is PUBLISHED; log warning and return if not
    - Generate `traceId` and `runId` (UUID v4)
    - PutEvents to EventBridge with source `courseforge.trigger`, detail-type `ScheduleTriggered`
    - PutItem run record with `triggerType: "scheduled"`
    - UpdateItem schedule record `lastRunAt` in schedules table
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [x] 3.2 Write unit tests for ScheduledTriggerFn (`functions/scheduled-trigger/handler.test.ts`)
    - Test valid PUBLISHED workflow → event published, run record written, lastRunAt updated
    - Test non-PUBLISHED workflow → no event, no run record, no error
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 6.6_

  - [x] 3.3 Write property test: Non-PUBLISHED workflow silent return (`functions/scheduled-trigger/handler.property.test.ts`)
    - **Property 4: Non-PUBLISHED workflow silent return (scheduled)**
    - **Validates: Requirements 6.1, 6.2**

  - [x] 3.4 Write property test: Successful scheduled trigger produces complete outputs (`functions/scheduled-trigger/handler.property.test.ts`)
    - **Property 5: Successful scheduled trigger produces complete outputs**
    - **Validates: Requirements 6.3, 6.4, 6.5, 6.6, 6.7**

- [x] 4. Checkpoint — Verify trigger handlers
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement HTTP Action Step Connector
  - [x] 5.1 Create `packages/connectors/http-action/index.ts`
    - Export `executeHttpAction(params, context, deps)` function
    - Implement `{{secret:ARN}}` resolution from Secrets Manager
    - Implement `{{context.field}}` resolution from ConnectorContext variables
    - Implement exponential backoff retry on 5xx and network errors (default 3 retries, 200ms initial delay)
    - Throw `HttpActionError` with status code and response body when all retries exhausted
    - Produce structured JSON log entries with `traceId`, `method`, `url`, `statusCode`, `attempt`, `durationMs`
    - Replace secret values with `[REDACTED]` in all log output
    - Do not retry on 4xx responses
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 5.2 Write unit tests for HTTP Action Connector (`packages/connectors/http-action/index.test.ts`)
    - Test successful GET/POST request
    - Test secret reference resolution
    - Test context variable resolution
    - Test 5xx triggers retry
    - Test 4xx does not trigger retry
    - Test all retries exhausted → HttpActionError
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 5.3 Write property test: Template reference resolution (`packages/connectors/http-action/index.property.test.ts`)
    - **Property 6: Template reference resolution**
    - **Validates: Requirements 7.2, 7.3**

  - [x] 5.4 Write property test: Retry with exponential backoff and error propagation (`packages/connectors/http-action/index.property.test.ts`)
    - **Property 7: Retry with exponential backoff and error propagation**
    - **Validates: Requirements 7.4, 7.5**

  - [x] 5.5 Write property test: Secret exclusion from logs (`packages/connectors/http-action/index.property.test.ts`)
    - **Property 8: Secret exclusion from logs**
    - **Validates: Requirements 7.6, 7.7**

- [x] 6. Implement Trigger Management API — Webhook Secret
  - [x] 6.1 Create `src/api/triggers/webhook-secret.ts`
    - Implement `createWebhookSecretHandler(deps)` factory following existing handler pattern
    - Generate 32-byte random token via `crypto.randomBytes(32)`
    - Store SHA-256 hash at `PK=TENANT#{tenantId}, SK=WEBHOOK_SECRET#{workflowId}`
    - Return raw token once in response body
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 6.2 Write unit tests for webhook secret handler (`src/api/triggers/webhook-secret.test.ts`)
    - Test creation returns 32-byte hex token
    - Test stored value is SHA-256 hash, not raw token
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 6.3 Write property test: Webhook secret hash round-trip (`src/api/triggers/webhook-secret.property.test.ts`)
    - **Property 9: Webhook secret hash round-trip**
    - **Validates: Requirements 8.1, 8.2, 8.3**

- [x] 7. Implement Trigger Management API — Schedule CRUD
  - [x] 7.1 Create `src/api/triggers/schedule.ts`
    - Implement `createCreateScheduleHandler(deps)` factory
    - Validate cron expression syntax
    - Reject intervals shorter than 15 minutes with 400
    - Create EventBridge Scheduler schedule in `courseforge-schedules` group
    - Write schedule record to Schedules_Table with PK `WORKFLOW#{workflowId}`, SK `SCHEDULE#{scheduleId}`
    - Return plain-language preview string
    - Implement `createDeleteScheduleHandler(deps)` factory
    - Delete EventBridge Scheduler schedule
    - Soft-delete DynamoDB record with `deletedAt` timestamp
    - Return 404 if schedule not found
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 10.1, 10.2, 10.3_

  - [x] 7.2 Write unit tests for schedule handlers (`src/api/triggers/schedule.test.ts`)
    - Test creation with valid cron
    - Test creation with invalid cron → 400
    - Test creation with < 15min interval → 400
    - Test deletion → soft-delete with deletedAt
    - Test deletion for non-existent → 404
    - _Requirements: 9.1, 9.2, 9.3, 10.1, 10.2, 10.3_

  - [x] 7.3 Write property test: Cron expression syntax validation (`src/api/triggers/schedule.property.test.ts`)
    - **Property 10: Cron expression syntax validation**
    - **Validates: Requirements 9.1**

  - [x] 7.4 Write property test: Minimum schedule interval enforcement (`src/api/triggers/schedule.property.test.ts`)
    - **Property 11: Minimum schedule interval enforcement**
    - **Validates: Requirements 9.2**

  - [x] 7.5 Write property test: Schedule creation produces complete outputs (`src/api/triggers/schedule.property.test.ts`)
    - **Property 12: Schedule creation produces complete outputs**
    - **Validates: Requirements 9.3, 9.4, 9.5**

  - [x] 7.6 Write property test: Schedule deletion soft-deletes record (`src/api/triggers/schedule.property.test.ts`)
    - **Property 13: Schedule deletion soft-deletes record**
    - **Validates: Requirements 10.1, 10.2**

- [x] 8. Checkpoint — Verify all application logic
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement DomainEvent conformance property tests
  - [x] 9.1 Write property test: DomainEvent structure conformance (`functions/webhook-ingress/handler.property.test.ts`)
    - **Property 14: DomainEvent structure conformance**
    - Test both WebhookIngressFn and ScheduledTriggerFn event outputs
    - **Validates: Requirements 11.1, 11.2**

  - [x] 9.2 Write property test: DomainEvent serialization round-trip (`functions/webhook-ingress/handler.property.test.ts`)
    - **Property 15: DomainEvent serialization round-trip**
    - **Validates: Requirements 11.3**

- [x] 10. Implement TriggerStack CDK infrastructure
  - [x] 10.1 Create `infra/lib/trigger-stack.ts`
    - Define `TriggerStackProps` extending `cdk.StackProps` with `eventBus` and `mainTable` references
    - Provision API Gateway HTTP API `courseforge-webhook-api` with `POST /webhook/{workflowId}` route
    - Provision DynamoDB table `courseforge-schedules` with PK/SK key schema
    - Provision EventBridge Scheduler group `courseforge-schedules`
    - Provision EventBridge rule on `courseforge-domain` matching source `courseforge.trigger` → WorkflowRunnerSFN target
    - Provision SQS DLQ `courseforge-trigger-dlq` as failure destination on rule target
    - Provision WebhookIngressFn Lambda (10s timeout) and ScheduledTriggerFn Lambda
    - Export webhook base URL as CloudFormation output
    - Grant appropriate IAM permissions to Lambdas
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 5.10_

  - [x] 10.2 Write CDK assertion tests (`infra/test/trigger-stack.test.ts`)
    - Test API Gateway HTTP API with correct name and route
    - Test DynamoDB schedules table with correct key schema
    - Test EventBridge Scheduler group
    - Test EventBridge rule with correct source pattern and SFN target
    - Test SQS DLQ with correct name
    - Test Lambda functions with correct timeouts
    - Test CloudFormation output for webhook base URL
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 3.1, 3.2, 3.3_

- [x] 11. Wire TriggerStack into CDK app entry point
  - [x] 11.1 Update `infra/bin/` CDK app to instantiate `TriggerStack` with references to FoundationStack outputs
    - Pass `eventBus` and `mainTable` from FoundationStack to TriggerStack props
    - _Requirements: 1.1, 3.1_

- [x] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All handlers use the existing factory pattern with dependency injection for testability
