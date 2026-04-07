# Implementation Plan: Run History & Observability UI

## Overview

Incrementally build the Run History & Observability UI feature from the data layer up through API handlers to UI logic modules. Each task builds on the previous, starting with shared types and schema, then pure utilities, then API handlers with repository interfaces, and finally UI state/view-model modules. Property-based tests use fast-check; unit tests use Vitest.

## Tasks

- [x] 1. Add shared type definitions and schema key builders
  - [x] 1.1 Add `Run`, `RunStep`, and `Notification` interfaces to `packages/types/src/events.ts` and export them from `packages/types/src/index.ts`
    - Add the three interfaces exactly as specified in the design document
    - Re-export `Run`, `RunStep`, and `Notification` from `packages/types/src/index.ts`
    - _Requirements: 1.1, 2.1, 4.1_

  - [x] 1.2 Add new key prefixes, key builders, and GSI constants to `src/models/schema.ts`
    - Add `STEP`, `USER`, `NOTIFICATION` to `KEY_PREFIX`
    - Add `runPK(runId)`, `stepSK(stepIndex, stepId)`, `userPK(userId)`, `notificationSK(timestamp, notificationId)` key builders
    - Add `GSI_WORKFLOW_RUNS` and `GSI_TENANT_STATUS` constants
    - _Requirements: 1.2, 1.3, 2.1, 4.1_

  - [x] 1.3 Write unit tests for new key builders in `src/models/schema.test.ts`
    - Test `runPK`, `stepSK` (zero-padded index), `userPK`, `notificationSK`
    - Test GSI constant values
    - _Requirements: 1.2, 1.3, 2.1, 4.1_

- [x] 2. Implement masking utility
  - [x] 2.1 Create `src/lib/mask-sensitive.ts` with `maskSensitiveFields` function
    - Implement recursive traversal for objects and arrays
    - Match keys against `SENSITIVE_KEY_PATTERN` (`/password|token|secret|key|credential|auth/i`)
    - Replace matched values with `"••••••••"`
    - Return primitives unchanged; never mutate input
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 2.2 Write unit tests for masking utility in `src/lib/mask-sensitive.test.ts`
    - Test top-level sensitive key redaction
    - Test nested object redaction
    - Test array-of-objects redaction
    - Test case-insensitive matching (`Password`, `API_TOKEN`, `secretKey`)
    - Test input immutability
    - Test passthrough of primitives (string, number, boolean, null)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 2.3 Write property test for masking idempotence in `src/lib/mask-sensitive.property.test.ts`
    - **Property 1: Round-trip idempotence — masking then serializing then deserializing then masking again produces an equivalent object**
    - **Validates: Requirement 8.6**

- [x] 3. Implement query parameter validation
  - [x] 3.1 Create `src/api/runs/validation.ts` with `validateRunsQueryParams`, `isValidISODate`, `clampLimit`, `encodeCursor`, `decodeCursor`
    - `clampLimit` returns `Math.min(Math.max(1, value), max ?? 100)`
    - `encodeCursor`/`decodeCursor` use base64 JSON round-trip; `decodeCursor` returns `null` on invalid input
    - `isValidISODate` validates ISO 8601 date strings
    - `validateRunsQueryParams` validates status against `RunStatus`, dates via `isValidISODate`, limit via `clampLimit`
    - _Requirements: 1.1, 1.4, 1.6, 1.7_

  - [x] 3.2 Write unit tests for validation in `src/api/runs/validation.test.ts`
    - Test valid and invalid ISO dates
    - Test limit clamping (negative, zero, over 100, normal)
    - Test cursor encode/decode round-trip and invalid cursor handling
    - Test full `validateRunsQueryParams` with valid and invalid inputs
    - _Requirements: 1.6, 1.7_

  - [x] 3.3 Write property tests for validation in `src/api/runs/validation.property.test.ts`
    - **Property 2: Cursor encode/decode round-trip — for any JSON-serializable object, `decodeCursor(encodeCursor(obj))` deep-equals `obj`**
    - **Validates: Requirement 1.4**
    - **Property 3: clampLimit bounds — for any integer n, `clampLimit(n)` is always in [1, 100]**
    - **Validates: Requirement 1.6**

- [x] 4. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement Runs API handler
  - [x] 5.1 Create `src/api/runs/handler.ts` with `RunRepository` interface and `createRunsHandler` factory
    - Define `RunRepository` interface with `queryByTenant`, `queryByWorkflow`, `queryByTenantStatus`, `getById`, `getSteps` methods
    - Implement query routing: `workflowId` → `GSI_WORKFLOW_RUNS`, `status` → `GSI_TENANT_STATUS`, neither → main table
    - Use `validateRunsQueryParams` for input validation; return 400 on invalid params
    - Build response with `runs` array and optional `nextCursor`
    - Resolve `tenantId` from request header using existing `resolveTenantId` from `src/api/triggers/shared.ts`
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7_

  - [x] 5.2 Write unit tests for Runs API handler in `src/api/runs/handler.test.ts`
    - Test query routing based on params (workflowId, status, neither)
    - Test 400 response for invalid params
    - Test cursor passthrough and response shape
    - _Requirements: 1.1, 1.2, 1.3, 1.7_

- [x] 6. Implement Run Detail API handler
  - [x] 6.1 Create `src/api/runs/detail-handler.ts` with `S3Client` interface and `createRunDetailHandler` factory
    - Define `S3Client` interface with `getObjectTruncated(bucket, key, maxBytes)` method
    - Fetch Run record; return 404 if not found or tenant mismatch
    - Query RunStep records with `PK=RUN#{runId}`, `SK begins_with STEP#`
    - For each step with `outputRef`, fetch first 500 chars from S3
    - Apply `maskSensitiveFields` to `inputSummary` and `outputSummary`
    - Sort steps by `stepIndex` ascending
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 6.2 Write unit tests for Run Detail handler in `src/api/runs/detail-handler.test.ts`
    - Test successful response with steps sorted by index
    - Test S3 truncated fetch for outputRef steps
    - Test masking applied to summaries
    - Test 404 for missing run and tenant mismatch
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6_

- [x] 7. Implement Notifications API handlers
  - [x] 7.1 Create `src/api/notifications/handler.ts` with `NotificationRepository` interface, `createNotificationsHandler`, and `createNotificationReadHandler`
    - `createNotificationsHandler`: query by userId, limit 20, newest first, partition unread-first then read, return `{ notifications, unreadCount }`
    - `createNotificationReadHandler`: update `read=true`, `readAt=now`; return 204 on success, 404 if not found or wrong user
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 7.2 Write unit tests for Notifications handlers in `src/api/notifications/handler.test.ts`
    - Test unread-first ordering and unreadCount calculation
    - Test mark-read returns 204
    - Test 404 for missing or wrong-user notification
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 8. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement Status Badge utility
  - [x] 9.1 Create `src/ui/status-badge.ts` with `STATUS_BADGE_MAP` and `getStatusBadge` function
    - Map each `RunStatus` to `{ label, colorClass, animate }` as specified in design
    - `getStatusBadge` returns the matching view model for a given status
    - _Requirements: 5.2, 6.1_

  - [x] 9.2 Write unit tests for status badge in `src/ui/status-badge.test.ts`
    - Test each RunStatus maps to correct label, colorClass, and animate flag
    - Test RUNNING has `animate: true`
    - _Requirements: 5.2_

- [x] 10. Implement Run List page logic
  - [x] 10.1 Create `src/ui/run-list.ts` with state management and pure functions
    - Implement `createRunListState`, `applyFilters`, `appendPage`, `sortFailedFirst`, `shouldPoll`, `buildEmptyStateMessage`
    - `sortFailedFirst`: FAILED runs first within date grouping, preserve chronological order otherwise
    - `shouldPoll`: returns true if any run has status RUNNING or PENDING
    - `buildEmptyStateMessage`: returns the specified empty state string
    - _Requirements: 5.1, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 10.1, 10.2, 10.3_

  - [x] 10.2 Write unit tests for run list logic in `src/ui/run-list.test.ts`
    - Test `sortFailedFirst` ordering
    - Test `shouldPoll` with various status combinations
    - Test `appendPage` cursor handling
    - Test `buildEmptyStateMessage` returns correct string
    - _Requirements: 5.5, 5.7, 5.8, 10.1, 10.2_

  - [x] 10.3 Write property test for sortFailedFirst in `src/ui/run-list.property.test.ts`
    - **Property 4: sortFailedFirst preserves all elements — output is a permutation of input (same length, same elements)**
    - **Validates: Requirement 5.5**

- [x] 11. Implement Run Detail page logic
  - [x] 11.1 Create `src/ui/run-detail.ts` with state management and pure functions
    - Implement `createRunDetailState`, `ERROR_CODE_MAP`, `getErrorExplanation`, `isTerminalStatus`, `shouldPollDetail`, `formatDuration`, `buildReplayBadgeText`
    - `getErrorExplanation`: lookup in map, fallback to generic message
    - `isTerminalStatus`: true for SUCCESS or FAILED
    - `shouldPollDetail`: true if run is non-null and status is RUNNING
    - `formatDuration`: convert ms to human-readable string (e.g., "1.2s", "2m 30s")
    - `buildReplayBadgeText`: returns `"Replay of run #{parentRunId}"`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.7, 6.10, 11.1, 11.2, 11.3, 12.1, 12.2, 12.3_

  - [x] 11.2 Write unit tests for run detail logic in `src/ui/run-detail.test.ts`
    - Test `getErrorExplanation` for known and unknown codes
    - Test `isTerminalStatus` for all RunStatus values
    - Test `shouldPollDetail` for RUNNING vs terminal statuses
    - Test `formatDuration` for various ms values
    - Test `buildReplayBadgeText` output format
    - _Requirements: 6.4, 6.10, 11.1, 11.2, 12.1, 12.2, 12.3_

- [x] 12. Implement NotificationBell logic
  - [x] 12.1 Create `src/ui/notification-bell.ts` with state management and pure functions
    - Implement `createNotificationBellState`, `updateNotifications`, `markNotificationRead`, `markAllRead`, `toggleDropdown`, `getVisibleNotifications`, `shouldShowBadge`, `formatRelativeTime`
    - `formatRelativeTime`: convert ISO timestamp to relative string ("2 min ago", "1 hr ago", "3 days ago")
    - `getVisibleNotifications`: return up to `limit` (default 5) notifications
    - `shouldShowBadge`: true when `unreadCount > 0`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 12.2 Write unit tests for notification bell logic in `src/ui/notification-bell.test.ts`
    - Test `updateNotifications` state update
    - Test `markNotificationRead` and `markAllRead`
    - Test `toggleDropdown` toggle behavior
    - Test `getVisibleNotifications` respects limit
    - Test `shouldShowBadge` for zero and non-zero unread counts
    - Test `formatRelativeTime` for various time deltas
    - _Requirements: 7.2, 7.3, 7.4, 7.6_

  - [x] 12.3 Write property test for formatRelativeTime in `src/ui/notification-bell.property.test.ts`
    - **Property 5: formatRelativeTime monotonicity — for timestamps t1 < t2 (both before now), the numeric component of `formatRelativeTime(t1)` is >= the numeric component of `formatRelativeTime(t2)`**
    - **Validates: Requirement 7.4**

- [x] 13. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All modules use dependency injection (repository/client interfaces) for testability
