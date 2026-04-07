# Implementation Plan: Run Orchestration

## Overview

Implement the Run Orchestration execution engine for CourseForge Connect. The plan builds incrementally: shared types and data-access helpers first, then each Lambda function with its tests, followed by the CDK stack wiring, EventBridge rule, Replay API, and integration tests. All code is TypeScript targeting Node.js 20, using Vitest + fast-check for testing.

## Tasks

- [x] 1. Define shared run-orchestration types and data-access helpers
  - [x] 1.1 Create run-orchestration type definitions
    - Create `functions/shared/types.ts` with `StepDefinition`, `RunRecord`, `RunStepRecord`, `AuditEntry`, `NotificationRecord`, `RunDomainEvent`, and all input/output interfaces from the design (RunInitializerInput/Output, ExecuteStepInput/Output, RunFinalizerInput/Output, RunFailedEvent, ReplayResponse)
    - _Requirements: 2.1, 2.2, 2.4, 3.1, 4.1, 5.5, 7.2, 10.1_

  - [x] 1.2 Create DynamoDB key builders and data-access helpers
    - Create `functions/shared/keys.ts` with key builder functions for Run_Record (`TENANT#{tenantId}`, `RUN#{timestamp}#{runId}`), RunStep_Record (`RUN#{runId}`, `STEP#{stepIndex}#{stepId}`), Audit_Entry, Notification_Record, and workflow version lookups
    - _Requirements: 2.1, 3.1, 4.3, 7.2_

  - [x] 1.3 Write property test for StepDefinition deserialization round-trip
    - **Property 1: StepDefinition deserialization round-trip**
    - Generate arbitrary StepDefinition arrays, serialize to JSON, deserialize, assert deep equality
    - **Validates: Requirements 2.2**

- [x] 2. Implement RunInitializerFn Lambda
  - [x] 2.1 Implement RunInitializerFn handler
    - Create `functions/run-initializer/handler.ts`
    - Fetch workflow record from Main_Table using PK `WORKFLOW#{workflowId}`, SK `VERSION#{versionId}`
    - Throw `workflow not found` if record missing; throw `no published version` if no published version
    - Deserialize `compiledPlan` into StepDefinition array
    - Update Run_Record: `status=RUNNING`, `versionId`, `startedAt`
    - Return RunInitializerOutput
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 2.2 Write unit tests for RunInitializerFn
    - Create `functions/run-initializer/handler.test.ts`
    - Test: throws `workflow not found` when workflow record is missing
    - Test: throws `no published version` when version is absent
    - Test: returns correct output shape for valid input
    - Test: updates Run_Record status to `RUNNING`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [x] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement ExecuteStepFn Lambda
  - [x] 4.1 Implement ExecuteStepFn handler with S3 offloading
    - Create `functions/execute-step/handler.ts`
    - Write RunStep_Record with `status=RUNNING`, `startedAt`
    - Resolve connector from Connector_Registry via `step.connectorKey`
    - Invoke `connector.run(step.params, accumulatedContext)`
    - On success: if output ≤ 4 KB store inline, if > 4 KB write to S3 at `runs/{runId}/steps/{stepId}/output.json` and store `outputRef`
    - Update RunStep_Record: `status=SUCCESS` or `status=FAILED` with error details
    - Return merged accumulated context with step result keyed by `step.stepId`
    - Emit X-Ray subsegment and CloudWatch metrics
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 8.1, 8.2, 8.3_

  - [x] 4.2 Write property test for connector registry resolution consistency
    - **Property 2: Connector registry resolution consistency**
    - Generate arbitrary connector keys (valid and invalid), assert resolution succeeds for known keys and throws for unknown keys
    - **Validates: Requirements 3.2**

  - [x] 4.3 Write property test for output offloading threshold decision
    - **Property 3: Output offloading threshold decision**
    - Generate arbitrary JSON-serializable outputs of varying sizes, assert inline vs S3 decision is correct based on 4 KB threshold
    - **Validates: Requirements 3.4, 3.5, 8.1, 8.2, 8.3**

  - [x] 4.4 Write property test for context accumulation
    - **Property 4: Context accumulation preserves existing keys**
    - Generate arbitrary context objects and step results, assert merged context contains all original keys plus the new step key
    - **Validates: Requirements 3.6**

  - [x] 4.5 Write unit tests for ExecuteStepFn
    - Create `functions/execute-step/handler.test.ts`
    - Test: stores output inline when ≤ 4 KB
    - Test: offloads output to S3 when > 4 KB
    - Test: updates RunStep_Record to `FAILED` with error details on connector failure
    - Test: throws error after recording failure
    - _Requirements: 3.1, 3.4, 3.5, 3.7, 3.8, 8.1, 8.2, 8.3_

- [x] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement RunFinalizerFn Lambda
  - [x] 6.1 Implement RunFinalizerFn handler
    - Create `functions/run-finalizer/handler.ts`
    - Update Run_Record: `status`, `endedAt`, `durationMs`; store error details when `FAILED`
    - Write Audit_Entry with `actionType=RUN_COMPLETED` or `RUN_FAILED`
    - Publish domain event to `courseforge-domain` bus with correct `source`, `detail-type`, and detail fields
    - Return `{ runId, status }`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 10.1, 10.3_

  - [x] 6.2 Write property test for run finalization status and timing
    - **Property 5: Run finalization persists correct status and timing**
    - Generate arbitrary finalization inputs with valid timestamps, assert Run_Record fields are set correctly
    - **Validates: Requirements 4.1**

  - [x] 6.3 Write property test for audit entry actionType mapping
    - **Property 6: Audit entry actionType matches run status**
    - Generate arbitrary status values (SUCCESS/FAILED), assert actionType mapping is correct
    - **Validates: Requirements 4.3**

  - [x] 6.4 Write property test for domain event structure
    - **Property 7: Domain event structure and status mapping**
    - Generate arbitrary finalization inputs, assert published event has all required fields and correct source/detail-type
    - **Validates: Requirements 4.4, 10.1, 10.3**

  - [x] 6.5 Write property test for domain event serialization round-trip
    - **Property 10: Domain event serialization round-trip**
    - Generate arbitrary domain event objects with JSON-safe values, assert `JSON.parse(JSON.stringify(event))` deeply equals the original
    - **Validates: Requirements 10.2**

  - [x] 6.6 Write unit tests for RunFinalizerFn
    - Create `functions/run-finalizer/handler.test.ts`
    - Test: writes audit entry with `RUN_COMPLETED` for success
    - Test: writes audit entry with `RUN_FAILED` for failure
    - Test: stores error details in Run_Record when status is FAILED
    - Test: publishes domain event with correct source and detail-type
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 10.1, 10.3_

- [x] 7. Implement NotificationFn Lambda
  - [x] 7.1 Implement NotificationFn handler
    - Create `functions/notification/handler.ts`
    - Receive `RunFailed` event from EventBridge
    - Query Main_Table for tenant users with notification preferences enabled
    - Batch write Notification_Records for each subscribed user
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 7.2 Write property test for notification count
    - **Property 9: Notification count matches subscribed users**
    - Generate arbitrary user sets with varying notification preferences, assert notification count equals subscribed count
    - **Validates: Requirements 7.2**

  - [x] 7.3 Write unit tests for NotificationFn
    - Create `functions/notification/handler.test.ts`
    - Test: writes one Notification_Record per subscribed user
    - Test: skips users without notification preferences enabled
    - Test: uses batch write operations
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 8. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement Replay API handler
  - [x] 9.1 Implement Replay API handler
    - Create `src/api/replay/handler.ts`
    - Fetch Run_Record; return 404 if not found
    - Return 422 if status is not `FAILED`
    - Create new Run_Record with `status=PENDING`, `triggerType=replay`, `parentRunId`
    - Publish `RunReplayed` event to Domain_Event_Bus
    - Return `{ newRunId, parentRunId }`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 9.2 Write property test for replay rejection of non-FAILED runs
    - **Property 8: Replay rejects non-FAILED runs**
    - Generate Run_Records with status in {PENDING, RUNNING, SUCCESS}, assert replay returns 422
    - **Validates: Requirements 5.2**

  - [x] 9.3 Write unit tests for Replay API
    - Create `src/api/replay/handler.test.ts`
    - Test: returns 422 for non-FAILED run statuses (PENDING, RUNNING, SUCCESS)
    - Test: creates new Run_Record with `triggerType=replay` and `parentRunId`
    - Test: publishes `RunReplayed` event with original trigger payload
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 10. Implement OrchestrationStack CDK infrastructure
  - [x] 10.1 Create OrchestrationStack with all resources
    - Create `infra/lib/orchestration-stack.ts`
    - Import foundation stack outputs (Main_Table, Artifact_Bucket, Domain_Event_Bus)
    - Provision WorkflowRunner Step Functions Standard Workflow with X-Ray tracing, 1-hour timeout
    - Define all 5 states: InitializeRun, ExecuteSteps (Map, MaxConcurrency=1), FinalizeRun, HandleStepFailure, FailRun
    - Provision RunInitializerFn (256 MB, 30s), ExecuteStepFn (512 MB, 5min), RunFinalizerFn (256 MB, 30s), NotificationFn (256 MB, 30s) — all Node.js 20
    - Provision EventBridge rule matching `source: courseforge.run`, `detail-type: RunFailed` → NotificationFn
    - Configure least-privilege IAM roles
    - Export WorkflowRunner state machine ARN as CloudFormation output
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 6.1, 6.2_

  - [x] 10.2 Write CDK snapshot/assertion tests for OrchestrationStack
    - Create `infra/test/orchestration-stack.test.ts`
    - Test: state machine named `courseforge-workflow-runner` with X-Ray tracing
    - Test: all 5 states present in state machine definition
    - Test: EventBridge rule matches `courseforge.run` / `RunFailed`
    - Test: NotificationFn is the rule target
    - Test: state machine ARN exported as CloudFormation output
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 6.1, 6.2_

- [x] 11. Wire CDK stack into the CDK app entry point
  - Update `infra/bin/` CDK app to instantiate OrchestrationStack, passing foundation stack references
  - _Requirements: 1.1, 1.7_

- [x] 12. Implement RunInitializerFn integration tests
  - [x] 12.1 Write integration tests for RunInitializerFn
    - Create `functions/run-initializer/handler.integration.test.ts`
    - Use Vitest + DynamoDB local mock
    - Test: non-existent workflow → error containing `workflow not found`
    - Test: workflow without published version → error containing `no published version`
    - Test: valid published workflow → returns step definitions, Run_Record status=RUNNING, startedAt set
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 13. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All Lambda handlers use Node.js 20 runtime with TypeScript
- fast-check v3.x is already a project dependency
