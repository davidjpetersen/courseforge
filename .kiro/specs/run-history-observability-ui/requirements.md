# Requirements Document

## Introduction

Run History and Observability UI is the frontend and API layer for CourseForge Connect that enables users to monitor workflow executions, inspect step-level details, replay failed runs, and receive failure notifications — all without accessing the AWS console. The feature builds on the existing run orchestration backend (Step Functions, DynamoDB single-table, S3 artifact storage) and exposes it through Next.js App Router pages and API routes. It covers four user stories: viewing the run list (S07), viewing run detail with step timeline (S08), replaying a failed run (S15), and receiving failure notifications (S16). A sensitive-field masking utility ensures that credential-like values are never displayed in the UI or returned in list-view API responses.

## Glossary

- **Run_List_Page**: The Next.js page at `/app/(dashboard)/runs/page.tsx` that displays a filterable, paginated table of workflow runs.
- **Run_Detail_Page**: The Next.js page at `/app/(dashboard)/runs/[runId]/page.tsx` that displays a run summary card and a vertical step timeline.
- **Notification_Bell**: The React component at `/app/components/NotificationBell.tsx` placed in the global navigation bar that displays unread notification count and a dropdown of recent failure notifications.
- **Runs_API**: The Next.js API route at `/api/runs` that queries DynamoDB for Run records with filtering and cursor-based pagination.
- **Run_Detail_API**: The Next.js API route at `/api/runs/:runId` that fetches a single Run record and its associated RunStep records from DynamoDB.
- **Replay_API**: The existing API route at `POST /api/runs/:runId/replay` that creates a new run from a previously failed run.
- **Notifications_API**: The Next.js API route at `/api/notifications` that queries DynamoDB for Notification records belonging to the current user.
- **Notification_Read_API**: The Next.js API route at `POST /api/notifications/:notificationId/read` that marks a single notification as read.
- **Masking_Utility**: The module at `/app/lib/mask-sensitive.ts` exporting `maskSensitiveFields` that recursively redacts values of credential-like keys in objects.
- **Run**: A TypeScript type imported from `/packages/types` representing a workflow execution record with fields `runId`, `workflowId`, `workflowName`, `tenantId`, `versionId`, `status`, `triggerType`, `triggerEventId`, `startedAt`, `endedAt`, `durationMs`, optional `parentRunId`, and optional `failedStepId`.
- **RunStep**: A TypeScript type imported from `/packages/types` representing a single step execution with fields `stepId`, `stepIndex`, `label`, `connectorKey`, `status`, `startedAt`, `endedAt`, `inputSummary`, `outputSummary`, optional `errorMessage`, optional `errorCode`, and optional `rawResponse`.
- **Notification**: A TypeScript type imported from `/packages/types` representing an in-app notification with fields `notificationId`, `type`, `workflowId`, `workflowName`, `runId`, `failedStepName`, `read`, and `createdAt`.
- **RunStatus**: An enum imported from `/packages/types` with values `PENDING`, `RUNNING`, `SUCCESS`, `FAILED`, and `REPLAYING`.
- **Main_Table**: The existing DynamoDB table (`courseforge-main`) storing Run, RunStep, and Notification records in a single-table design.
- **Status_Badge**: A UI component that renders a colored badge based on RunStatus: SUCCESS (green), FAILED (red), RUNNING (amber pulse), PENDING (gray), REPLAYING (blue).
- **Sensitive_Key_Pattern**: The regular expression `/password|token|secret|key|credential|auth/i` used by the Masking_Utility to identify keys whose values must be redacted.

## Requirements

### Requirement 1: Run List API

**User Story:** As a workflow administrator, I want to fetch a filtered and paginated list of workflow runs, so that I can monitor execution history without loading all records at once.

#### Acceptance Criteria

1. WHEN a GET request is received at `/api/runs` with optional query parameters `workflowId`, `status`, `dateFrom`, `dateTo`, `limit` (default 50), and `cursor`, THE Runs_API SHALL query the Main_Table using the appropriate GSI and return a JSON response containing `runs` (array of Run objects) and an optional `nextCursor` string.
2. WHEN the `workflowId` query parameter is provided, THE Runs_API SHALL query the `GSI_WORKFLOW_RUNS` index filtered by the specified workflow.
3. WHEN the `status` query parameter is provided, THE Runs_API SHALL query the `GSI_TENANT_STATUS` index filtered by the specified status value.
4. WHEN the `cursor` query parameter is provided, THE Runs_API SHALL use the cursor as the DynamoDB `ExclusiveStartKey` to resume pagination from the previous position.
5. THE Runs_API SHALL exclude PII-containing payload fields from the Run objects returned in the list response.
6. WHEN the `limit` query parameter exceeds 100, THE Runs_API SHALL clamp the limit to 100.
7. IF the query parameters contain invalid values (non-ISO date strings, negative limit, unknown status), THEN THE Runs_API SHALL return a 400 Bad Request response with a descriptive error message.

### Requirement 2: Run Detail API

**User Story:** As a workflow administrator, I want to fetch the full detail of a single run including all step execution data, so that I can diagnose issues at the step level.

#### Acceptance Criteria

1. WHEN a GET request is received at `/api/runs/:runId`, THE Run_Detail_API SHALL fetch the Run record from the Main_Table and all RunStep records with PK `RUN#{runId}` and SK beginning with `STEP#`.
2. WHEN a RunStep record has an `outputRef` field containing an S3 key, THE Run_Detail_API SHALL fetch the first 500 characters of the referenced S3 object and include the result as the `outputSummary` field on the RunStep.
3. THE Run_Detail_API SHALL apply the Masking_Utility to the `inputSummary` and `outputSummary` fields of each RunStep before returning the response.
4. THE Run_Detail_API SHALL return a JSON response containing `run` (Run object) and `steps` (array of RunStep objects sorted by `stepIndex` ascending).
5. IF the `runId` does not exist in the Main_Table, THEN THE Run_Detail_API SHALL return a 404 Not Found response.
6. IF the Run record belongs to a different tenant than the authenticated user, THEN THE Run_Detail_API SHALL return a 404 Not Found response.

### Requirement 3: Replay API Re-Export

**User Story:** As a workflow administrator, I want to replay a failed run from the run detail page, so that transient failures can be retried without leaving the observability UI.

#### Acceptance Criteria

1. THE Run_Detail_Page SHALL import and re-export the existing Replay_API handler at `POST /api/runs/:runId/replay`.
2. WHEN the Replay_API returns a successful response containing `newRunId`, THE Run_Detail_Page SHALL display a success toast notification and redirect the browser to the new run's detail page at `/runs/{newRunId}`.
3. IF the Replay_API returns a 422 response, THEN THE Run_Detail_Page SHALL display an error toast indicating the run is not eligible for replay.

### Requirement 4: Notifications API

**User Story:** As a workflow user, I want to fetch my recent failure notifications, so that I can see which workflows have failed and navigate to the relevant run detail.

#### Acceptance Criteria

1. WHEN a GET request is received at `/api/notifications`, THE Notifications_API SHALL query the Main_Table with PK `USER#{userId}` and SK beginning with `NOTIFICATION#`, returning unread notifications first, then read notifications, with a maximum of 20 records.
2. THE Notifications_API SHALL return a JSON response containing `notifications` (array of Notification objects) and `unreadCount` (number of notifications where `read` is `false`).
3. WHEN a POST request is received at `/api/notifications/:notificationId/read`, THE Notification_Read_API SHALL update the Notification record in the Main_Table setting `read` to `true` and `readAt` to the current ISO 8601 timestamp.
4. WHEN the notification is marked as read, THE Notification_Read_API SHALL return a 204 No Content response.
5. IF the `notificationId` does not exist or belongs to a different user, THEN THE Notification_Read_API SHALL return a 404 Not Found response.

### Requirement 5: Run List Page

**User Story:** As a workflow administrator, I want a full-width table view of all workflow runs with filtering and pagination, so that I can quickly find and assess run outcomes.

#### Acceptance Criteria

1. THE Run_List_Page SHALL render a full-width table with columns: Workflow name, Trigger type, Started, Duration, and Status.
2. THE Run_List_Page SHALL render each run's status using the Status_Badge component with colors: SUCCESS (green), FAILED (red), RUNNING (amber with pulse animation), PENDING (gray), REPLAYING (blue).
3. THE Run_List_Page SHALL display a filter bar containing a workflow selector dropdown, a status multi-select control, and a date range picker.
4. WHEN the user applies filters, THE Run_List_Page SHALL call the Runs_API with the corresponding query parameters and update the table with the filtered results.
5. THE Run_List_Page SHALL sort failed runs to the top within any date grouping.
6. THE Run_List_Page SHALL display a "Load more" button when the API response contains a `nextCursor` value, and load the next page of results when clicked.
7. WHEN no runs exist, THE Run_List_Page SHALL display the empty state message: "No runs yet. Publish a workflow to see executions here."
8. WHILE any visible run has status `RUNNING` or `PENDING`, THE Run_List_Page SHALL auto-refresh the run data every 30 seconds and cancel the refresh interval on component unmount.

### Requirement 6: Run Detail Page

**User Story:** As a workflow administrator, I want to see the full execution detail of a run including a step-by-step timeline, so that I can diagnose exactly where and why a failure occurred.

#### Acceptance Criteria

1. THE Run_Detail_Page SHALL render a run summary card displaying the workflow name, trigger type, started timestamp, duration, status (using Status_Badge), and version identifier.
2. THE Run_Detail_Page SHALL render a vertical step timeline below the summary card, displaying RunStep cards in ascending `stepIndex` order.
3. THE Run_Detail_Page SHALL render each RunStep card with the step index, label, connector icon, Status_Badge, start time, duration, expandable input summary, and expandable output summary or error message.
4. WHEN a RunStep has an `errorMessage`, THE Run_Detail_Page SHALL display the `errorCode`, `errorMessage`, and a "What does this mean?" tooltip containing a human-readable explanation looked up from a static map of common error codes.
5. WHEN the run status is `FAILED`, THE Run_Detail_Page SHALL display a red highlighted banner at the top of the step timeline containing a "Replay this run" button.
6. WHEN the user clicks the "Replay this run" button, THE Run_Detail_Page SHALL send a POST request to `/api/runs/:runId/replay`, display a success toast on success, and redirect to the new run's detail page.
7. WHEN the Run record has a `parentRunId`, THE Run_Detail_Page SHALL display a linked badge reading "Replay of run #{parentRunId}" that navigates to the parent run's detail page.
8. THE Run_Detail_Page SHALL display a "Back to workflow" breadcrumb link.
9. IF the `runId` does not exist or belongs to another tenant, THEN THE Run_Detail_Page SHALL render a 404 page.
10. WHILE the run status is `RUNNING`, THE Run_Detail_Page SHALL refresh the step data every 5 seconds until the run reaches a terminal status (`SUCCESS`, `FAILED`).

### Requirement 7: Notification Bell Component

**User Story:** As a workflow user, I want a notification bell in the navigation bar that shows unread failure alerts and lets me navigate directly to the failed run, so that I can respond to failures promptly.

#### Acceptance Criteria

1. THE Notification_Bell SHALL fetch notifications from the Notifications_API on component mount and every 60 seconds thereafter.
2. WHEN the `unreadCount` is greater than zero, THE Notification_Bell SHALL display a numeric badge showing the unread count.
3. WHEN the `unreadCount` is zero, THE Notification_Bell SHALL hide the numeric badge.
4. WHEN the user clicks the Notification_Bell icon, THE Notification_Bell SHALL open a dropdown panel displaying up to 5 recent notifications, each showing the workflow name, failed step name, and relative time (e.g., "2 min ago").
5. WHEN the user clicks a notification in the dropdown, THE Notification_Bell SHALL send a POST request to `/api/notifications/:notificationId/read` and navigate the browser to the run detail page for that notification's `runId`.
6. THE Notification_Bell dropdown SHALL include a "Mark all as read" button that sends a POST request to the Notification_Read_API for each unread notification and resets the `unreadCount` to zero.
7. THE Notification_Bell SHALL cancel all polling intervals on component unmount.

### Requirement 8: Sensitive Field Masking Utility

**User Story:** As a platform developer, I want a utility that recursively redacts credential-like values from objects, so that sensitive data is never displayed in the UI or returned in API responses.

#### Acceptance Criteria

1. THE Masking_Utility SHALL export a function `maskSensitiveFields(obj: unknown): unknown` that accepts any value and returns a deep copy with sensitive values redacted.
2. WHEN the Masking_Utility encounters an object key matching the Sensitive_Key_Pattern (`/password|token|secret|key|credential|auth/i`), THE Masking_Utility SHALL replace the value with the string `"••••••••"`.
3. THE Masking_Utility SHALL recursively traverse nested objects and arrays, applying the redaction rule at every level.
4. THE Masking_Utility SHALL return the original value unchanged for non-object, non-array inputs (strings, numbers, booleans, null).
5. THE Masking_Utility SHALL produce a new object without mutating the original input.
6. FOR ALL valid JavaScript objects, masking then serializing then deserializing then masking again SHALL produce an equivalent object (round-trip idempotence property).

### Requirement 9: Sensitive Field Masking Unit Tests

**User Story:** As a platform developer, I want comprehensive unit tests for the masking utility, so that I can be confident sensitive data is always redacted correctly.

#### Acceptance Criteria

1. THE Masking_Utility test suite SHALL verify that top-level keys matching the Sensitive_Key_Pattern have their values replaced with `"••••••••"`.
2. THE Masking_Utility test suite SHALL verify that keys nested inside child objects are redacted.
3. THE Masking_Utility test suite SHALL verify that keys inside objects within arrays are redacted.
4. THE Masking_Utility test suite SHALL verify that key name matching is case-insensitive (e.g., `Password`, `API_TOKEN`, `secretKey`).
5. THE Masking_Utility test suite SHALL verify that the original input object is not mutated after masking.
6. THE Masking_Utility test suite SHALL verify that non-object inputs (string, number, boolean, null) are returned unchanged.

### Requirement 10: Run List Auto-Refresh Lifecycle

**User Story:** As a workflow administrator, I want the run list to automatically refresh while runs are in progress, so that I see up-to-date statuses without manually reloading the page.

#### Acceptance Criteria

1. WHEN the Run_List_Page mounts and the current data contains at least one run with status `RUNNING` or `PENDING`, THE Run_List_Page SHALL start a 30-second polling interval that re-fetches the run list from the Runs_API.
2. WHEN all visible runs reach a terminal status (`SUCCESS`, `FAILED`), THE Run_List_Page SHALL stop the polling interval.
3. WHEN the Run_List_Page unmounts, THE Run_List_Page SHALL cancel any active polling interval to prevent memory leaks and stale requests.

### Requirement 11: Run Detail Step Refresh Lifecycle

**User Story:** As a workflow administrator, I want the run detail page to refresh step data while a run is in progress, so that I can watch execution progress in near real-time.

#### Acceptance Criteria

1. WHEN the Run_Detail_Page mounts and the run status is `RUNNING`, THE Run_Detail_Page SHALL start a 5-second polling interval that re-fetches the run and step data from the Run_Detail_API.
2. WHEN the run reaches a terminal status (`SUCCESS`, `FAILED`), THE Run_Detail_Page SHALL stop the polling interval.
3. WHEN the Run_Detail_Page unmounts, THE Run_Detail_Page SHALL cancel any active polling interval.

### Requirement 12: Error Code Tooltip Lookup

**User Story:** As a workflow administrator, I want human-readable explanations for common error codes, so that I can understand failures without consulting external documentation.

#### Acceptance Criteria

1. THE Run_Detail_Page SHALL maintain a static map of common error codes to human-readable explanation strings.
2. WHEN a RunStep has an `errorCode` that exists in the static map, THE Run_Detail_Page SHALL display the corresponding explanation in a "What does this mean?" tooltip.
3. WHEN a RunStep has an `errorCode` that does not exist in the static map, THE Run_Detail_Page SHALL display a generic tooltip message: "This error code is not yet documented. Contact support if the issue persists."
