# Requirements Document

## Introduction

Event Triggering and Routing enables CourseForge Connect workflows to be initiated via three trigger mechanisms — HTTP webhooks, cron-based schedules, and domain events — and to invoke external systems through a generic HTTP action step connector. This feature covers CDK infrastructure provisioning (API Gateway, EventBridge Scheduler, EventBridge rules, DLQ), Lambda handlers for webhook ingress and scheduled triggers, an HTTP action step connector with secret resolution and retry logic, and API routes for managing webhook secrets and schedules.

## Glossary

- **Trigger_Stack**: The AWS CDK stack that provisions all trigger-related infrastructure resources including API Gateway, EventBridge Scheduler, EventBridge rules, and the dead-letter queue.
- **Webhook_API**: The API Gateway HTTP API (`courseforge-webhook-api`) that receives inbound HTTP POST requests on the `/webhook/{workflowId}` route.
- **WebhookIngressFn**: The Lambda function that validates, authenticates, and processes inbound webhook requests, then publishes a domain event to EventBridge.
- **ScheduledTriggerFn**: The Lambda function invoked by EventBridge Scheduler that validates the workflow and publishes a domain event for scheduled workflow runs.
- **HTTP_Action_Connector**: The connector module that executes outbound HTTP requests as a workflow action step, with secret resolution and retry logic.
- **Trigger_Management_API**: The set of API routes for creating webhook secrets, creating schedules, and deleting schedules.
- **Domain_Event_Bus**: The existing EventBridge custom event bus (`courseforge-domain`) used for routing domain events.
- **Schedules_Table**: The DynamoDB table (`courseforge-schedules`) that stores schedule records for scheduled triggers.
- **Main_Table**: The existing DynamoDB table (`courseforge-main`) that stores workflow, run, and webhook secret records.
- **WorkflowRunnerSFN**: The Step Functions state machine that orchestrates workflow execution when triggered.
- **Trigger_DLQ**: The SQS dead-letter queue (`courseforge-trigger-dlq`) that captures undeliverable trigger events.
- **Run_Record**: A DynamoDB item representing a single workflow execution instance, keyed by tenant and timestamp.
- **ConnectorContext**: The runtime context object passed to connectors containing workflow variables and execution metadata.

## Requirements

### Requirement 1: Webhook Ingress API Gateway Infrastructure

**User Story:** As a platform operator, I want a dedicated HTTP API endpoint for webhook ingress, so that external systems can trigger workflows via HTTP POST.

#### Acceptance Criteria

1. THE Trigger_Stack SHALL provision an API Gateway HTTP API named `courseforge-webhook-api` with a `POST /webhook/{workflowId}` route targeting the WebhookIngressFn Lambda.
2. THE Trigger_Stack SHALL validate that the `workflowId` path parameter is present on the `POST /webhook/{workflowId}` route.
3. THE Trigger_Stack SHALL export the webhook base URL as a CloudFormation output.

### Requirement 2: Scheduled Trigger Infrastructure

**User Story:** As a platform operator, I want infrastructure for cron-based scheduled triggers, so that workflows can run on recurring schedules.

#### Acceptance Criteria

1. THE Trigger_Stack SHALL provision a DynamoDB table named `courseforge-schedules` with partition key `PK` (String, pattern `WORKFLOW#{workflowId}`) and sort key `SK` (String, pattern `SCHEDULE#{scheduleId}`).
2. THE Trigger_Stack SHALL provision an EventBridge Scheduler schedule group named `courseforge-schedules`.
3. THE Trigger_Stack SHALL configure the ScheduledTriggerFn Lambda as the target for schedules created within the `courseforge-schedules` schedule group.

### Requirement 3: EventBridge Routing Infrastructure

**User Story:** As a platform operator, I want trigger events routed to the workflow runner, so that domain events automatically start workflow executions.

#### Acceptance Criteria

1. THE Trigger_Stack SHALL provision an EventBridge rule on the `courseforge-domain` bus matching events with source `courseforge.trigger`.
2. THE Trigger_Stack SHALL configure the WorkflowRunnerSFN Step Functions state machine as the target of the EventBridge rule.
3. THE Trigger_Stack SHALL provision an SQS dead-letter queue named `courseforge-trigger-dlq` as the failure destination for the EventBridge rule target.

### Requirement 4: Webhook Ingress Request Validation and Authentication

**User Story:** As a platform developer, I want the webhook ingress Lambda to validate and authenticate requests, so that only authorized callers can trigger workflows.

#### Acceptance Criteria

1. WHEN a POST request is received, THE WebhookIngressFn SHALL extract the `workflowId` from the path parameters and the `tenantId` and bearer token from the `Authorization` header.
2. WHEN a bearer token is provided, THE WebhookIngressFn SHALL validate the token by comparing its SHA-256 hash against the stored hash in the Main_Table (PK: `TENANT#{tenantId}`, SK: `WEBHOOK_SECRET#{workflowId}`).
3. IF the bearer token hash does not match the stored hash, THEN THE WebhookIngressFn SHALL return a 401 Unauthorized response.
4. IF the `workflowId` path parameter is missing, THEN THE WebhookIngressFn SHALL return a 400 Bad Request response.
5. IF the `Authorization` header is missing or malformed, THEN THE WebhookIngressFn SHALL return a 401 Unauthorized response.

### Requirement 5: Webhook Ingress Workflow Validation and Event Publishing

**User Story:** As a platform developer, I want the webhook ingress Lambda to validate workflow status and publish domain events, so that only published workflows are triggered and events are properly routed.

#### Acceptance Criteria

1. WHEN authentication succeeds, THE WebhookIngressFn SHALL verify that the workflow status is `PUBLISHED` by querying the Main_Table.
2. IF the workflow status is not `PUBLISHED`, THEN THE WebhookIngressFn SHALL return a 409 Conflict response with a message indicating the workflow is not in a triggerable state.
3. WHEN the workflow is `PUBLISHED`, THE WebhookIngressFn SHALL validate that the request body is valid JSON.
4. IF the request body is not valid JSON, THEN THE WebhookIngressFn SHALL return a 400 Bad Request response.
5. WHEN validation succeeds, THE WebhookIngressFn SHALL generate a `traceId` using UUID v4.
6. WHEN validation succeeds, THE WebhookIngressFn SHALL publish a DomainEvent to the Domain_Event_Bus with source `courseforge.trigger` and detail-type `WebhookReceived`.
7. WHEN validation succeeds, THE WebhookIngressFn SHALL write a Run_Record to the Main_Table with PK `TENANT#{tenantId}` and SK `RUN#{timestamp}#{runId}`.
8. THE WebhookIngressFn SHALL return a 202 Accepted response containing `runId` and `traceId` in the response body.
9. THE WebhookIngressFn SHALL respond within 500 milliseconds under normal operating conditions.
10. THE WebhookIngressFn SHALL have a Lambda timeout of 10 seconds.

### Requirement 6: Scheduled Trigger Execution

**User Story:** As a platform developer, I want the scheduled trigger Lambda to process scheduler invocations, so that workflows run on their configured schedules.

#### Acceptance Criteria

1. WHEN the ScheduledTriggerFn receives an event containing `workflowId`, `tenantId`, and `scheduleId` from EventBridge Scheduler, THE ScheduledTriggerFn SHALL validate that the workflow status is `PUBLISHED`.
2. IF the workflow status is not `PUBLISHED`, THEN THE ScheduledTriggerFn SHALL log a warning and return without error.
3. WHEN the workflow is `PUBLISHED`, THE ScheduledTriggerFn SHALL generate a `traceId` using UUID v4.
4. WHEN the workflow is `PUBLISHED`, THE ScheduledTriggerFn SHALL publish a DomainEvent to the Domain_Event_Bus with source `courseforge.trigger` and detail-type `ScheduleTriggered`.
5. WHEN the workflow is `PUBLISHED`, THE ScheduledTriggerFn SHALL write a Run_Record to the Main_Table with `triggerType` set to `scheduled`.
6. WHEN the Run_Record is written, THE ScheduledTriggerFn SHALL update the schedule record `lastRunAt` field in the Schedules_Table.
7. THE ScheduledTriggerFn SHALL return without error after completing all operations.

### Requirement 7: HTTP Action Step Connector Execution

**User Story:** As a workflow author, I want a generic HTTP action step connector, so that workflows can call external APIs as part of their execution.

#### Acceptance Criteria

1. THE HTTP_Action_Connector SHALL export an `executeHttpAction` function accepting `HttpActionParams` and `ConnectorContext` parameters and returning a `Promise<HttpActionResult>`.
2. WHEN `HttpActionParams` contains `{{secret:ARN}}` references, THE HTTP_Action_Connector SHALL resolve the referenced values from Secrets Manager before executing the HTTP request.
3. WHEN `HttpActionParams` contains `{{context.field}}` references, THE HTTP_Action_Connector SHALL resolve the referenced values from the `ConnectorContext` variables.
4. WHEN an HTTP request fails, THE HTTP_Action_Connector SHALL retry with exponential backoff up to a configurable maximum number of attempts.
5. IF all retry attempts are exhausted, THEN THE HTTP_Action_Connector SHALL throw an `HttpActionError` containing the final HTTP status code and response body.
6. THE HTTP_Action_Connector SHALL produce structured JSON log entries for each HTTP request attempt.
7. THE HTTP_Action_Connector SHALL exclude secret values from all log output.

### Requirement 8: Webhook Secret Management API

**User Story:** As a workflow administrator, I want to generate and manage webhook authentication tokens, so that webhook endpoints are secured with per-workflow secrets.

#### Acceptance Criteria

1. WHEN a POST request is received at `/api/workflows/:workflowId/webhook-secret`, THE Trigger_Management_API SHALL generate a cryptographically random 32-byte token.
2. THE Trigger_Management_API SHALL store the SHA-256 hash of the generated token in the Main_Table with PK `TENANT#{tenantId}` and SK `WEBHOOK_SECRET#{workflowId}`.
3. THE Trigger_Management_API SHALL return the raw token value in the response body exactly once; the raw token value SHALL NOT be stored or retrievable after the initial response.

### Requirement 9: Schedule Management API — Create Schedule

**User Story:** As a workflow administrator, I want to create cron-based schedules for workflows, so that workflows can be triggered on recurring time intervals.

#### Acceptance Criteria

1. WHEN a POST request is received at `/api/workflows/:workflowId/schedule` with a cron expression, THE Trigger_Management_API SHALL validate the cron expression syntax.
2. IF the cron expression specifies an interval shorter than 15 minutes, THEN THE Trigger_Management_API SHALL reject the request with a 400 Bad Request response.
3. WHEN the cron expression is valid, THE Trigger_Management_API SHALL return a plain-language preview of the schedule in the response body.
4. WHEN the cron expression is valid, THE Trigger_Management_API SHALL create an EventBridge Scheduler schedule in the `courseforge-schedules` schedule group targeting the ScheduledTriggerFn.
5. WHEN the EventBridge Scheduler schedule is created, THE Trigger_Management_API SHALL write a schedule record to the Schedules_Table with PK `WORKFLOW#{workflowId}` and SK `SCHEDULE#{scheduleId}`.

### Requirement 10: Schedule Management API — Delete Schedule

**User Story:** As a workflow administrator, I want to delete schedules for workflows, so that I can stop recurring workflow executions.

#### Acceptance Criteria

1. WHEN a DELETE request is received at `/api/workflows/:workflowId/schedule/:scheduleId`, THE Trigger_Management_API SHALL delete the corresponding EventBridge Scheduler schedule from the `courseforge-schedules` schedule group.
2. WHEN the EventBridge Scheduler schedule is deleted, THE Trigger_Management_API SHALL soft-delete the schedule record in the Schedules_Table by setting a `deletedAt` timestamp.
3. IF the specified schedule does not exist, THEN THE Trigger_Management_API SHALL return a 404 Not Found response.

### Requirement 11: Domain Event Structure Consistency

**User Story:** As a platform developer, I want all trigger-originated domain events to follow a consistent structure, so that downstream consumers can reliably process events.

#### Acceptance Criteria

1. THE WebhookIngressFn SHALL publish DomainEvents containing `tenantId`, `workflowId`, `eventType`, `payload`, `traceId`, and `timestamp` (ISO 8601) fields conforming to the existing DomainEvent interface.
2. THE ScheduledTriggerFn SHALL publish DomainEvents containing `tenantId`, `workflowId`, `eventType`, `payload`, `traceId`, and `timestamp` (ISO 8601) fields conforming to the existing DomainEvent interface.
3. FOR ALL DomainEvents published by the WebhookIngressFn, parsing the event then serializing the event then parsing the event again SHALL produce an equivalent DomainEvent object (round-trip property).

### Requirement 12: Webhook Ingress Unit Test Coverage

**User Story:** As a platform developer, I want comprehensive unit tests for the WebhookIngressFn, so that webhook processing logic is verified and regressions are caught.

#### Acceptance Criteria

1. THE WebhookIngressFn test suite SHALL verify that valid authenticated requests return a 202 Accepted response with `runId` and `traceId`.
2. THE WebhookIngressFn test suite SHALL verify that requests with invalid bearer tokens return a 401 Unauthorized response.
3. THE WebhookIngressFn test suite SHALL verify that requests for non-PUBLISHED workflows return a 409 Conflict response.
4. THE WebhookIngressFn test suite SHALL verify that requests with invalid JSON bodies return a 400 Bad Request response.
5. THE WebhookIngressFn test suite SHALL verify that a DomainEvent is published to EventBridge on successful processing.
6. THE WebhookIngressFn test suite SHALL verify that a Run_Record is written to DynamoDB on successful processing.
7. THE WebhookIngressFn test suite SHALL use Vitest as the test framework.
