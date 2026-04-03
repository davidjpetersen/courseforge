# Requirements Document

## Introduction

Run Orchestration is the core execution engine for CourseForge Connect. It receives trigger events and executes workflow steps sequentially using AWS Step Functions, with per-step traceability, retry logic, error capture, and large-output offloading to S3. The layer includes a CDK-provisioned state machine, four Lambda functions (run initializer, step executor, run finalizer, failure notification), a replay API for re-running failed executions, and EventBridge-based failure notification routing. All components emit X-Ray traces and CloudWatch metrics for observability.

## Glossary

- **Orchestration_Stack**: The AWS CDK stack (`/infra/lib/orchestration-stack.ts`) that provisions the Step Functions state machine, Lambda functions, and EventBridge rule for the run orchestration layer.
- **WorkflowRunner**: The Step Functions Standard Workflow state machine named `courseforge-workflow-runner` that orchestrates the lifecycle of a single workflow run.
- **RunInitializerFn**: The Lambda function (`/functions/run-initializer/handler.ts`) that fetches the published workflow version, updates the Run record to RUNNING, and returns the compiled step definitions.
- **ExecuteStepFn**: The Lambda function (`/functions/execute-step/handler.ts`) that executes a single workflow step by resolving its connector and invoking the connector's `run` method.
- **RunFinalizerFn**: The Lambda function (`/functions/run-finalizer/handler.ts`) that writes the final Run status, audit log entry, and publishes a domain event on run completion or failure.
- **NotificationFn**: The Lambda function (`/functions/notification/handler.ts`) that receives RunFailed events and writes in-app notification records for subscribed users.
- **Run_Record**: A DynamoDB item in the Main_Table representing a workflow execution instance, keyed as PK `TENANT#{tenantId}`, SK `RUN#{timestamp}#{runId}`.
- **RunStep_Record**: A DynamoDB item in the Main_Table representing a single step execution within a run, keyed as PK `RUN#{runId}`, SK `STEP#{stepIndex}#{stepId}`.
- **StepDefinition**: An object containing `stepId`, `stepIndex`, `connectorKey`, `actionType`, `params`, and `retryPolicy` describing a single executable step within a compiled workflow plan.
- **Connector_Registry**: The module at `/packages/connectors/registry.ts` that maps `connectorKey` strings to connector implementations exposing a `run(params, context)` method.
- **Main_Table**: The existing DynamoDB table (`courseforge-main`) used for storing Run_Records, RunStep_Records, audit log entries, and notification records.
- **Artifact_Bucket**: The existing S3 bucket (`courseforge-artifacts-{account}-{region}`) used for storing step outputs that exceed 4 KB.
- **Domain_Event_Bus**: The existing EventBridge custom event bus (`courseforge-domain`) used for publishing run lifecycle events.
- **Replay_API**: The API route (`POST /api/runs/:runId/replay`) that creates a new run from a previously failed run's trigger payload.
- **Audit_Entry**: A DynamoDB item recording a run lifecycle event, keyed as PK `TENANT#{tenantId}`, SK `AUDIT#{timestamp}#{runId}`.
- **Notification_Record**: A DynamoDB item representing an in-app notification for a user, keyed as PK `USER#{userId}`, SK `NOTIFICATION#{timestamp}#{notificationId}`.

## Requirements

### Requirement 1: WorkflowRunner State Machine Infrastructure

**User Story:** As a platform operator, I want a Step Functions state machine that orchestrates workflow runs with retries and error handling, so that workflow executions are reliable and traceable.

#### Acceptance Criteria

1. THE Orchestration_Stack SHALL provision a Step Functions Standard Workflow named `courseforge-workflow-runner` with X-Ray tracing enabled and an execution timeout of 1 hour.
2. THE WorkflowRunner SHALL define an `InitializeRun` state as a Lambda task invoking the RunInitializerFn with `ResultPath` set to `$.initResult`, retry configuration of `maxAttempts=2` and `intervalSeconds=1`, and a catch transition to the `FailRun` state.
3. THE WorkflowRunner SHALL define an `ExecuteSteps` state as a Map state iterating over `$.initResult.steps` with `MaxConcurrency` set to 1, `ResultPath` set to `$.stepResults`, and a catch transition to the `HandleStepFailure` state.
4. THE WorkflowRunner SHALL define a `FinalizeRun` state as a Lambda task invoking the RunFinalizerFn on the success path after `ExecuteSteps` completes.
5. THE WorkflowRunner SHALL define a `HandleStepFailure` state as a Lambda task invoking the RunFinalizerFn with failure context, transitioning to the `FailRun` state after completion.
6. THE WorkflowRunner SHALL define a `FailRun` state as a Fail state with error code `WorkflowRunFailed`.
7. THE Orchestration_Stack SHALL export the WorkflowRunner state machine ARN as a CloudFormation output.

### Requirement 2: Run Initialization

**User Story:** As a platform developer, I want the run initializer to fetch the published workflow version and prepare step definitions, so that the state machine has the data it needs to execute each step.

#### Acceptance Criteria

1. WHEN the RunInitializerFn receives input containing `tenantId`, `workflowId`, `runId`, `traceId`, and `payload`, THE RunInitializerFn SHALL fetch the workflow's current published version from the Main_Table using PK `WORKFLOW#{workflowId}` and SK `VERSION#{versionId}`.
2. WHEN the published version is fetched, THE RunInitializerFn SHALL deserialize the `compiledPlan` field into an array of StepDefinition objects.
3. WHEN the published version is fetched, THE RunInitializerFn SHALL update the Run_Record in the Main_Table with `status` set to `RUNNING`, the resolved `versionId`, and `startedAt` set to the current ISO 8601 timestamp.
4. WHEN initialization succeeds, THE RunInitializerFn SHALL return an object containing `steps` (array of StepDefinition), `workflowId`, `runId`, `tenantId`, `traceId`, and `payload`.
5. IF the workflow record does not exist in the Main_Table, THEN THE RunInitializerFn SHALL throw an error with message containing `workflow not found`.
6. IF the workflow does not have a published version, THEN THE RunInitializerFn SHALL throw an error with message containing `no published version`.

### Requirement 3: Step Execution

**User Story:** As a platform developer, I want each workflow step to be executed individually with status tracking and output management, so that step-level traceability and debugging are possible.

#### Acceptance Criteria

1. WHEN the ExecuteStepFn receives input containing `step` (StepDefinition), `runId`, `tenantId`, `traceId`, and `accumulatedContext`, THE ExecuteStepFn SHALL write a RunStep_Record to the Main_Table with PK `RUN#{runId}`, SK `STEP#{stepIndex}#{stepId}`, `status` set to `RUNNING`, and `startedAt` set to the current ISO 8601 timestamp.
2. WHEN the RunStep_Record is written, THE ExecuteStepFn SHALL resolve the connector from the Connector_Registry using `step.connectorKey`.
3. WHEN the connector is resolved, THE ExecuteStepFn SHALL invoke the connector's `run(params, context)` method with the step's `params` and the `accumulatedContext`.
4. WHEN the connector execution succeeds and the output size is 4 KB or less, THE ExecuteStepFn SHALL update the RunStep_Record with `status` set to `SUCCESS`, `endedAt` set to the current ISO 8601 timestamp, and the output stored inline in the `output` field.
5. WHEN the connector execution succeeds and the output size exceeds 4 KB, THE ExecuteStepFn SHALL write the output to the Artifact_Bucket and update the RunStep_Record with `status` set to `SUCCESS`, `endedAt`, and an `outputRef` field containing the S3 object key.
6. WHEN the connector execution succeeds, THE ExecuteStepFn SHALL return a merged context object combining `accumulatedContext` with the current step's result keyed by `step.stepId`.
7. WHEN the connector execution fails after the connector's own retries are exhausted, THE ExecuteStepFn SHALL update the RunStep_Record with `status` set to `FAILED`, `endedAt`, and an `error` object containing `message`, `code`, and `rawResponse` fields.
8. WHEN the connector execution fails, THE ExecuteStepFn SHALL throw an error so that the Step Functions Map state catch handler routes execution to the `HandleStepFailure` state.
9. THE ExecuteStepFn SHALL emit an X-Ray subsegment for each connector execution.
10. THE ExecuteStepFn SHALL emit CloudWatch metrics `courseforge/StepExecutionDuration` and `courseforge/StepSuccess` for each step execution.

### Requirement 4: Run Finalization

**User Story:** As a platform developer, I want the run finalizer to record the final run status, write an audit log, and publish a domain event, so that run outcomes are persisted and downstream systems are notified.

#### Acceptance Criteria

1. WHEN the RunFinalizerFn receives input containing `runId`, `tenantId`, `status` (either `SUCCESS` or `FAILED`), and optionally `error` and `stepResults`, THE RunFinalizerFn SHALL update the Run_Record in the Main_Table with the provided `status`, `endedAt` set to the current ISO 8601 timestamp, and computed `durationMs`.
2. WHEN the `status` is `FAILED`, THE RunFinalizerFn SHALL store error detail in the Run_Record containing `failedStepId`, `errorMessage`, and `errorCode`.
3. WHEN the Run_Record is updated, THE RunFinalizerFn SHALL write an Audit_Entry to the Main_Table with PK `TENANT#{tenantId}`, SK `AUDIT#{timestamp}#{runId}`, and `actionType` set to `RUN_COMPLETED` for success or `RUN_FAILED` for failure.
4. WHEN the Audit_Entry is written, THE RunFinalizerFn SHALL publish a domain event to the Domain_Event_Bus with source `courseforge.run`, detail-type `RunCompleted` or `RunFailed`, and detail containing `tenantId`, `workflowId`, `runId`, `status`, and `durationMs`.
5. WHEN all operations complete, THE RunFinalizerFn SHALL return an object containing `runId` and `status`.

### Requirement 5: Replay Failed Runs

**User Story:** As a workflow administrator, I want to replay a failed run, so that transient failures can be retried without manually re-triggering the workflow.

#### Acceptance Criteria

1. WHEN a POST request is received at `/api/runs/:runId/replay`, THE Replay_API SHALL fetch the Run_Record from the Main_Table.
2. IF the Run_Record `status` is not `FAILED`, THEN THE Replay_API SHALL return a 422 Unprocessable Entity response.
3. WHEN the Run_Record `status` is `FAILED`, THE Replay_API SHALL create a new Run_Record with `status` set to `PENDING`, `triggerType` set to `replay`, and `parentRunId` set to the original `runId`.
4. WHEN the new Run_Record is created, THE Replay_API SHALL publish an event to the Domain_Event_Bus with source `courseforge.trigger`, detail-type `RunReplayed`, and the original trigger payload in the detail.
5. WHEN the event is published, THE Replay_API SHALL return a response containing `newRunId` and `parentRunId`.

### Requirement 6: Run Failure Notification Routing

**User Story:** As a platform operator, I want an EventBridge rule that routes run failure events to a notification Lambda, so that users are informed when their workflows fail.

#### Acceptance Criteria

1. THE Orchestration_Stack SHALL provision an EventBridge rule on the `courseforge-domain` bus matching events with source `courseforge.run` and detail-type `RunFailed`.
2. THE Orchestration_Stack SHALL configure the NotificationFn Lambda as the target of the run failure EventBridge rule.

### Requirement 7: In-App Failure Notifications

**User Story:** As a workflow user, I want to receive in-app notifications when a workflow run fails, so that I can take corrective action promptly.

#### Acceptance Criteria

1. WHEN the NotificationFn receives a `RunFailed` event, THE NotificationFn SHALL query the Main_Table for all users in the tenant (PK `TENANT#{tenantId}`, SK begins with `USER#`) who have notification preferences enabled for the failed workflow's `workflowId` or for `all` workflows.
2. WHEN subscribed users are identified, THE NotificationFn SHALL write a Notification_Record for each user to the Main_Table with PK `USER#{userId}`, SK `NOTIFICATION#{timestamp}#{notificationId}`, and fields `type` set to `RUN_FAILED`, `workflowId`, `runId`, `workflowName`, `failedStepName`, `read` set to `false`, and `createdAt` set to the current ISO 8601 timestamp.
3. THE NotificationFn SHALL write notifications using DynamoDB batch write operations to minimize round trips.

### Requirement 8: Step Output Offloading

**User Story:** As a platform developer, I want large step outputs stored in S3 rather than inline in DynamoDB, so that the 400 KB DynamoDB item size limit is respected and large payloads are handled gracefully.

#### Acceptance Criteria

1. WHEN a connector execution produces output larger than 4 KB, THE ExecuteStepFn SHALL write the output as a JSON object to the Artifact_Bucket with key pattern `runs/{runId}/steps/{stepId}/output.json`.
2. WHEN the output is written to S3, THE ExecuteStepFn SHALL store the S3 object key in the RunStep_Record `outputRef` field instead of storing the output inline.
3. WHEN a connector execution produces output of 4 KB or less, THE ExecuteStepFn SHALL store the output inline in the RunStep_Record `output` field.

### Requirement 9: Run Initialization Integration Tests

**User Story:** As a platform developer, I want integration tests for the RunInitializerFn, so that initialization logic is verified against realistic DynamoDB interactions.

#### Acceptance Criteria

1. THE RunInitializerFn integration test suite SHALL use Vitest as the test framework and a DynamoDB local mock for data access.
2. THE RunInitializerFn integration test suite SHALL verify that a request for a non-existent workflow results in an error containing `workflow not found`.
3. THE RunInitializerFn integration test suite SHALL verify that a request for a workflow without a published version results in an error containing `no published version`.
4. THE RunInitializerFn integration test suite SHALL verify that a request for a valid published workflow returns the deserialized step definitions, updates the Run_Record status to `RUNNING`, and sets the `startedAt` timestamp.

### Requirement 10: Run Finalization Domain Event Consistency

**User Story:** As a platform developer, I want domain events published by the run finalizer to follow a consistent structure, so that downstream consumers can reliably process run lifecycle events.

#### Acceptance Criteria

1. THE RunFinalizerFn SHALL publish domain events containing `tenantId`, `workflowId`, `runId`, `status`, and `durationMs` fields.
2. FOR ALL domain events published by the RunFinalizerFn, parsing the event then serializing the event then parsing the event again SHALL produce an equivalent domain event object (round-trip property).
3. THE RunFinalizerFn SHALL set the domain event `source` to `courseforge.run` and `detail-type` to `RunCompleted` for successful runs or `RunFailed` for failed runs.
