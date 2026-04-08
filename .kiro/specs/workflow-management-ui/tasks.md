# Implementation Plan: Workflow Management UI

## Overview

Enhance the existing workflow list and detail pages with full table columns, filtering, row-level context menus, lifecycle modals, a tabbed detail layout with sidebar, and shared components. All pure UI logic is extracted into `app/lib/workflow-ui-utils.ts` for testability. The implementation builds incrementally: pure logic → shared components → modals → list page → detail page → navigation.

## Tasks

- [x] 1. Create pure logic module `app/lib/workflow-ui-utils.ts`
  - [x] 1.1 Implement status badge, filtering, and action visibility functions
    - Create `app/lib/workflow-ui-utils.ts` with TypeScript types (`WorkflowStatus`, `ContextMenuAction`, `SidebarAction`, `ChecklistItem`)
    - Implement `getStatusBadgeClasses(status)` mapping DRAFT→slate, PUBLISHED→emerald, PAUSED→amber, ARCHIVED→rose with slate fallback for unknown
    - Implement `filterWorkflowsByStatus(workflows, status)` returning all when status is 'All', otherwise filtering by match
    - Implement `getAvailableActions(status, environmentId)` returning context menu actions; include 'promote' only when env is 'dev'
    - Implement `getSidebarActions(status, environmentId)` per design: DRAFT→['publish'], PUBLISHED→['pause','archive']+promote if dev, PAUSED→['publish','archive'], ARCHIVED→[]
    - Implement `isEditableStatus(status)` returning true only for DRAFT
    - _Requirements: 1.4, 2.4, 4.2, 4.3, 5.1, 5.6, 5.7, 5.8, 5.9, 16.1_

  - [x] 1.2 Implement publish checklist builder
    - Implement `buildPublishChecklist(workflow)` that checks: all connections active, trigger configured, at least one step present
    - Return `ChecklistItem[]` with label and passed boolean for each check
    - _Requirements: 11.1, 11.2_

  - [x] 1.3 Implement cron utility functions
    - Implement `parseCronExpression(cron)` validating 5-field cron syntax
    - Implement `isMinimumInterval(cron, minMinutes)` checking minimum 15-minute interval
    - Implement `cronToPlainLanguage(cron)` converting cron to human-readable string
    - Implement `getNextRunTimes(cron, count)` computing next N run times
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

  - [x] 1.4 Write unit tests for workflow-ui-utils
    - Test `getStatusBadgeClasses` for all four statuses and unknown fallback
    - Test `filterWorkflowsByStatus` for 'All' and each specific status
    - Test `getAvailableActions` for dev vs prod environments
    - Test `getSidebarActions` for each status + environment combination
    - Test `buildPublishChecklist` with passing and failing conditions
    - Test cron functions for valid, invalid, and edge-case expressions
    - _Requirements: 1.4, 2.4, 4.2, 4.3, 5.6–5.9, 11.1, 15.1–15.5_

- [x] 2. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Create shared components
  - [x] 3.1 Create WorkflowStatusBadge component
    - Create `app/components/WorkflowStatusBadge.tsx` accepting a `status` string prop
    - Use `getStatusBadgeClasses()` from workflow-ui-utils to render a color-coded pill badge
    - Render the status text inside the badge with appropriate Tailwind classes matching existing badge patterns
    - _Requirements: 1.4, 5.2, 16.1_

  - [x] 3.2 Create StepSummaryCard component
    - Create `app/components/StepSummaryCard.tsx` accepting index, connectorIcon, label, and params props
    - Call `maskSensitiveFields(params)` from `app/lib/mask-sensitive.ts` before rendering parameter values
    - Display step index, connector icon placeholder, label, and masked key-value pairs
    - _Requirements: 7.1, 7.2, 16.2, 16.3_

  - [x] 3.3 Create PublishChecklist component
    - Create `app/components/PublishChecklist.tsx` accepting `items: ChecklistItem[]`
    - Render each item with a pass (green check) or fail (red X) icon based on `passed` boolean
    - _Requirements: 11.1, 11.2_

  - [x] 3.4 Create CronPickerModal component
    - Create `app/components/CronPickerModal.tsx` with open, initialCron, onSave, onClose props
    - Wire input field to `parseCronExpression`, `cronToPlainLanguage`, `isMinimumInterval`, and `getNextRunTimes` from workflow-ui-utils
    - Show real-time plain-language preview, validation error for <15 min intervals, and next 3 run times
    - Disable Save button when expression is invalid or below minimum interval
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

- [x] 4. Create confirmation modals
  - [x] 4.1 Create PublishModal component
    - Create `app/components/PublishModal.tsx` with open, workflowId, workflowName, checklistItems, onConfirm, onClose props
    - Render PublishChecklist inside the modal
    - Disable the Publish button until all checklist items pass
    - On confirm, POST to `/api/workflows/{workflowId}/publish`, apply optimistic status update, revert on failure
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [x] 4.2 Create PauseModal component
    - Create `app/components/PauseModal.tsx` with open, workflowId, workflowName, onConfirm, onClose props
    - Display warning message "This will stop all scheduled and webhook triggers."
    - On confirm, POST to `/api/workflows/{workflowId}/pause`, update status to PAUSED, show error on failure
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [x] 4.3 Create ArchiveModal component
    - Create `app/components/ArchiveModal.tsx` with open, workflowId, workflowName, currentStatus, onConfirm, onClose props
    - When currentStatus is PUBLISHED, show warning that workflow must be paused first
    - When currentStatus is DRAFT or PAUSED, show confirmation prompt
    - On confirm, POST to `/api/workflows/{workflowId}/archive`, update status to ARCHIVED, show error on failure
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x] 4.4 Create PromoteModal component
    - Create `app/components/PromoteModal.tsx` with open, workflowId, workflowName, onSuccess, onClose props
    - Display message "Creates a new workflow in prod as a DRAFT. You must publish it separately."
    - On confirm, POST to `/api/workflows/{workflowId}/promote`, on success show link to `/workflows/{newWorkflowId}`, show error on failure
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

- [x] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Enhance Workflow List Page
  - [x] 6.1 Add filter bar and status dropdown to list page
    - Update `app/(dashboard)/workflows/page.tsx` to add a filter bar section with the EnvironmentSelector and a status dropdown (All, DRAFT, PUBLISHED, PAUSED, ARCHIVED)
    - Use `filterWorkflowsByStatus()` to apply client-side status filtering
    - Re-fetch workflows when environment changes via EnvironmentContext
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 6.2 Expand table columns and add row links
    - Update the table to include columns: Name, Recipe, Environment, Status, Last run, Actions
    - Render workflow name as a clickable `Link` to `/workflows/{workflowId}`
    - Replace inline status badge with `WorkflowStatusBadge` component
    - _Requirements: 1.2, 1.3, 1.4_

  - [x] 6.3 Add "New workflow" button and enhanced empty state
    - Add a "New workflow" button in the page header that navigates to `/recipes`
    - Update empty state to show "No workflows yet. Choose a recipe to get started." with a CTA button linking to `/recipes`
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 6.4 Add context menu and wire modals to list page
    - Add a context menu (dropdown) in the Actions column of each row using `getAvailableActions()` to determine visible options
    - Wire Publish, Pause, Archive, Promote menu items to open their respective modals
    - Wire "View runs" to navigate to `/runs?workflowId={workflowId}`
    - Manage `activeModal` state to track which modal is open and for which workflow
    - After modal confirm callbacks, refresh the workflow list
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

- [x] 7. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Enhance Workflow Detail Page — Layout and Data Fetching
  - [x] 8.1 Update detail page to fetch from single-workflow endpoint and render two-column layout
    - Update `app/(dashboard)/workflows/[workflowId]/page.tsx` to fetch from `GET /api/workflows/{workflowId}` instead of filtering the list endpoint
    - Render a two-column layout on desktop (sidebar left, tab panel right) and single-column stacked on mobile
    - Handle loading, error, and not-found states
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 8.2 Build sidebar with metadata and action buttons
    - Display workflow name (editable inline when DRAFT via `isEditableStatus()`), WorkflowStatusBadge, last published timestamp, environment badge, recipe link, created by, created at
    - Render action buttons using `getSidebarActions()` to determine which buttons to show
    - Wire action buttons to open PublishModal, PauseModal, ArchiveModal, PromoteModal
    - Add "View runs" link navigating to `/runs?workflowId={workflowId}`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10_

  - [x] 8.3 Implement tab navigation shell
    - Create tab bar with four tabs: Configuration, Trigger, Connections, Version History
    - Manage `activeTab` state, render the selected tab panel content
    - _Requirements: 6.2_

- [x] 9. Implement Detail Page Tabs
  - [x] 9.1 Implement Configuration tab
    - Render compiled plan steps using StepSummaryCard components
    - Show "Edit configuration" button only when status is DRAFT, navigating to recipe wizard with pre-filled values
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 9.2 Implement Trigger tab
    - Display trigger type (Webhook or Scheduled)
    - For webhook: show masked URL, "Rotate webhook secret" button, curl example
    - For scheduled: show plain-language description via `cronToPlainLanguage()`, next run time, "Edit schedule" button opening CronPickerModal, "Pause schedule" button
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 9.3 Implement Connections tab
    - List each connection with name, connector type, and status badge
    - Show warning banner "One or more connections need attention" when any connection has status "error", with link to connections page
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 9.4 Implement Version History tab
    - Fetch versions from `GET /api/workflows/{workflowId}/versions` on tab mount
    - Render table with Version, Published by, Published at, Action columns
    - Add "View compiled plan" action opening a modal with step names for that version
    - Add tooltip explaining rollback is not available in MVP
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 10. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Update dashboard navigation
  - [x] 11.1 Add "Workflows" link to dashboard sidebar
    - Update `app/(dashboard)/layout.tsx` to include a sidebar navigation with a "Workflows" link positioned between "Recipes" and "Connections"
    - Link navigates to `/workflows`
    - _Requirements: 17.1, 17.2, 17.3_

- [x] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Pure logic in `workflow-ui-utils.ts` is implemented first so all components can import it
- Existing page patterns (gradient background, rounded cards, EnvironmentSelector placement) are preserved
- `maskSensitiveFields` from `app/lib/mask-sensitive.ts` is reused, not duplicated
