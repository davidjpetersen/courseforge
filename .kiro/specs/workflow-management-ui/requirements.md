# Requirements Document

## Introduction

The Workflow Management UI provides the user-facing pages and components for CourseForge Connect where users create, view, publish, pause, archive, and promote workflows. It consists of a workflow list page, a workflow detail page with tabbed content, confirmation modals for lifecycle actions, and shared UI components. The UI is built with Next.js App Router and Tailwind CSS, calling the Workflow Management API endpoints defined in the backend spec.

## Glossary

- **Workflow_List_Page**: The page at `/app/(dashboard)/workflows/page.tsx` that displays a full-width table of workflows with filtering, status badges, and row-level actions
- **Workflow_Detail_Page**: The page at `/app/(dashboard)/workflows/[workflowId]/page.tsx` that displays a two-column layout with sidebar metadata and tabbed main content
- **WorkflowStatusBadge**: A reusable component at `/app/components/WorkflowStatusBadge.tsx` that renders a color-coded pill badge for DRAFT (slate), PUBLISHED (emerald), PAUSED (amber), and ARCHIVED (rose) statuses
- **StepSummaryCard**: A reusable component at `/app/components/StepSummaryCard.tsx` that displays a step index, connector icon, label, and masked parameter values
- **PublishChecklist**: A reusable component at `/app/components/PublishChecklist.tsx` that renders a pre-flight checklist of pass/fail items before publishing
- **CronPickerModal**: A modal component at `/app/components/CronPickerModal.tsx` that accepts and validates a 5-field cron expression with plain-language preview
- **EnvironmentContext**: The existing React context at `app/context/EnvironmentContext.tsx` providing the current environmentId ('dev' or 'prod') and a setter function
- **EnvironmentSelector**: The existing Dev/Prod pill toggle component at `app/components/EnvironmentSelector.tsx`
- **Filter_Bar**: The section of the Workflow_List_Page containing the EnvironmentSelector pill and a status dropdown for filtering the workflow table
- **Context_Menu**: A per-row dropdown menu in the workflow table Actions column providing Publish, Pause, Archive, View runs, and Promote to prod options
- **Sidebar**: The left column of the Workflow_Detail_Page containing workflow metadata, action buttons, and navigation links
- **Tab_Panel**: The main content area of the Workflow_Detail_Page containing four tabs: Configuration, Trigger, Connections, and Version history
- **Publish_Modal**: A confirmation modal that displays a pre-flight checklist and a Publish button that is disabled until all checks pass
- **Pause_Modal**: A simple confirmation dialog warning that pausing stops all scheduled and webhook triggers
- **Archive_Modal**: A confirmation dialog that warns the workflow must be paused first if currently PUBLISHED
- **Promote_Modal**: A confirmation modal explaining that promotion creates a new DRAFT workflow in prod, with a confirm button that calls the promote API
- **Dashboard_Sidebar_Nav**: The main navigation sidebar in the dashboard layout containing links to dashboard sections

## Requirements

### Requirement 1: Workflow List Page — Table and Data Fetching

**User Story:** As a tenant administrator, I want to see all my workflows in a full-width table with key metadata columns, so that I can quickly assess the state of my automation pipelines.

#### Acceptance Criteria

1. WHEN the Workflow_List_Page loads, THE Workflow_List_Page SHALL fetch workflows from `GET /api/environments/{environmentId}/workflows` using the environmentId from EnvironmentContext
2. WHEN the API response is received, THE Workflow_List_Page SHALL render a full-width table with columns: Name, Recipe, Environment, Status, Last run, and Actions
3. WHEN a workflow row is rendered, THE Workflow_List_Page SHALL display the workflow name as a clickable link navigating to `/workflows/{workflowId}`
4. WHEN a workflow row is rendered, THE WorkflowStatusBadge SHALL display the status using the color scheme: DRAFT (slate), PUBLISHED (emerald), PAUSED (amber), ARCHIVED (rose)
5. IF the API request fails, THEN THE Workflow_List_Page SHALL display an error message in a styled error banner

### Requirement 2: Workflow List Page — Filtering

**User Story:** As a tenant administrator, I want to filter workflows by environment and status, so that I can focus on the workflows relevant to my current task.

#### Acceptance Criteria

1. THE Filter_Bar SHALL display the EnvironmentSelector component as a Dev/Prod pill toggle
2. THE Filter_Bar SHALL display a status dropdown with options: All, DRAFT, PUBLISHED, PAUSED, ARCHIVED
3. WHEN the user changes the environment selection, THE Workflow_List_Page SHALL re-fetch workflows from the API using the selected environmentId
4. WHEN the user selects a status filter, THE Workflow_List_Page SHALL filter the displayed workflows to show only workflows matching the selected status
5. WHEN both environment and status filters are active, THE Workflow_List_Page SHALL apply both filters to the displayed results

### Requirement 3: Workflow List Page — Empty State and New Workflow

**User Story:** As a tenant administrator, I want to see a helpful empty state when no workflows exist and a clear path to create one, so that I can get started quickly.

#### Acceptance Criteria

1. WHEN the workflow list is empty after fetching, THE Workflow_List_Page SHALL display the message "No workflows yet. Choose a recipe to get started." with a call-to-action button
2. WHEN the user clicks the empty state call-to-action button, THE Workflow_List_Page SHALL navigate the user to `/recipes`
3. THE Workflow_List_Page SHALL display a "New workflow" button in the page header area
4. WHEN the user clicks the "New workflow" button, THE Workflow_List_Page SHALL navigate the user to `/recipes`

### Requirement 4: Workflow List Page — Row Actions

**User Story:** As a tenant administrator, I want to perform lifecycle actions on workflows directly from the list, so that I can manage workflows without navigating to each detail page.

#### Acceptance Criteria

1. THE Workflow_List_Page SHALL display a Context_Menu in the Actions column of each workflow row
2. THE Context_Menu SHALL include the following options: Publish, Pause, Archive, View runs, and Promote to prod
3. WHEN the current environment is not "dev", THE Context_Menu SHALL hide the "Promote to prod" option
4. WHEN the user selects "View runs" from the Context_Menu, THE Workflow_List_Page SHALL navigate to `/runs?workflowId={workflowId}`
5. WHEN the user selects "Publish" from the Context_Menu, THE Workflow_List_Page SHALL open the Publish_Modal for the selected workflow
6. WHEN the user selects "Pause" from the Context_Menu, THE Workflow_List_Page SHALL open the Pause_Modal for the selected workflow
7. WHEN the user selects "Archive" from the Context_Menu, THE Workflow_List_Page SHALL open the Archive_Modal for the selected workflow
8. WHEN the user selects "Promote to prod" from the Context_Menu, THE Workflow_List_Page SHALL open the Promote_Modal for the selected workflow

### Requirement 5: Workflow Detail Page — Sidebar

**User Story:** As a tenant administrator, I want to see workflow metadata and perform lifecycle actions from the detail page sidebar, so that I can manage a workflow in context.

#### Acceptance Criteria

1. THE Sidebar SHALL display the workflow name, and the name SHALL be editable inline only when the workflow status is DRAFT
2. THE Sidebar SHALL display the WorkflowStatusBadge and the last published timestamp
3. THE Sidebar SHALL display an environment badge showing the workflow's environmentId
4. THE Sidebar SHALL display the recipe name as a clickable link navigating to the recipe detail page
5. THE Sidebar SHALL display the "Created by" user and "Created at" timestamp
6. WHEN the workflow status is DRAFT, THE Sidebar SHALL display a "Publish" action button
7. WHEN the workflow status is PUBLISHED, THE Sidebar SHALL display "Pause" and "Archive" action buttons
8. WHEN the workflow status is PAUSED, THE Sidebar SHALL display "Publish" and "Archive" action buttons
9. WHEN the workflow environmentId is "dev" and the status is PUBLISHED, THE Sidebar SHALL display a "Promote to prod" button
10. THE Sidebar SHALL display a "View runs" link that navigates to `/runs?workflowId={workflowId}`

### Requirement 6: Workflow Detail Page — Layout and Data Fetching

**User Story:** As a tenant administrator, I want the workflow detail page to load workflow data and display it in a responsive two-column layout, so that I can view all workflow information on any device.

#### Acceptance Criteria

1. WHEN the Workflow_Detail_Page loads, THE Workflow_Detail_Page SHALL fetch the workflow from `GET /api/workflows/{workflowId}`
2. THE Workflow_Detail_Page SHALL render a two-column layout on desktop with the Sidebar on the left and the Tab_Panel on the right
3. THE Workflow_Detail_Page SHALL render a single-column stacked layout on mobile with the Sidebar above the Tab_Panel
4. IF the workflow is not found, THEN THE Workflow_Detail_Page SHALL display a "Workflow not found" message
5. IF the API request fails, THEN THE Workflow_Detail_Page SHALL display an error message in a styled error banner

### Requirement 7: Workflow Detail Page — Configuration Tab

**User Story:** As a tenant administrator, I want to view the compiled plan of my workflow with masked secrets, so that I can review the configuration without exposing sensitive data.

#### Acceptance Criteria

1. THE Configuration tab SHALL display a read-only summary of the compiled plan using StepSummaryCard components for each step
2. WHEN a step contains parameter values with secret references, THE StepSummaryCard SHALL mask the secret values by displaying masked placeholder text instead of the actual value
3. WHEN the workflow status is DRAFT, THE Configuration tab SHALL display an "Edit configuration" button
4. WHEN the user clicks the "Edit configuration" button, THE Configuration tab SHALL navigate to the recipe wizard with pre-filled values from the current paramSnapshot
5. WHEN the workflow status is not DRAFT, THE Configuration tab SHALL hide the "Edit configuration" button

### Requirement 8: Workflow Detail Page — Trigger Tab

**User Story:** As a tenant administrator, I want to view and manage the trigger configuration for my workflow, so that I can control how the workflow is activated.

#### Acceptance Criteria

1. THE Trigger tab SHALL display the trigger type as either "Webhook" or "Scheduled"
2. WHEN the trigger type is "Webhook", THE Trigger tab SHALL display the webhook URL with the value masked
3. WHEN the trigger type is "Webhook", THE Trigger tab SHALL display a "Rotate webhook secret" button and a curl example snippet
4. WHEN the trigger type is "Scheduled", THE Trigger tab SHALL display the schedule as a plain-language description and the next run time
5. WHEN the trigger type is "Scheduled", THE Trigger tab SHALL display an "Edit schedule" button that opens the CronPickerModal
6. WHEN the trigger type is "Scheduled", THE Trigger tab SHALL display a "Pause schedule" button

### Requirement 9: Workflow Detail Page — Connections Tab

**User Story:** As a tenant administrator, I want to see the status of all connections used by my workflow, so that I can identify and resolve connection issues.

#### Acceptance Criteria

1. THE Connections tab SHALL list each connection used by the workflow, displaying the connection name, connector type, and a status badge
2. IF any connection has a status equal to "error", THEN THE Connections tab SHALL display a warning banner with the message "One or more connections need attention"
3. WHEN the warning banner is displayed, THE Connections tab SHALL include a link to the connections page

### Requirement 10: Workflow Detail Page — Version History Tab

**User Story:** As a tenant administrator, I want to view the version history of my workflow, so that I can track changes over time.

#### Acceptance Criteria

1. WHEN the Version history tab loads, THE Version history tab SHALL fetch versions from `GET /api/workflows/{workflowId}/versions`
2. THE Version history tab SHALL display a table with columns: Version, Published by, Published at, and Action
3. THE Version history tab SHALL display a "View compiled plan" action for each version that opens a modal showing the step names for that version
4. THE Version history tab SHALL display a tooltip on the version table explaining that rollback is not available in MVP

### Requirement 11: Publish Confirmation Modal

**User Story:** As a tenant administrator, I want to see a pre-flight checklist before publishing a workflow, so that I can confirm all prerequisites are met.

#### Acceptance Criteria

1. WHEN the Publish_Modal opens, THE PublishChecklist SHALL display a checklist with the following items: all connections active, trigger configured, at least one step present
2. THE PublishChecklist SHALL display a pass icon for each check that passes and a fail icon for each check that fails
3. THE Publish_Modal SHALL disable the "Publish" button until all checklist items pass
4. WHEN the user clicks the "Publish" button, THE Publish_Modal SHALL send a POST request to `/api/workflows/{workflowId}/publish`
5. WHEN the publish request is sent, THE Publish_Modal SHALL apply an optimistic UI update by immediately changing the status badge to PUBLISHED
6. IF the publish API request fails, THEN THE Publish_Modal SHALL revert the optimistic UI update and display an error message

### Requirement 12: Pause Confirmation Modal

**User Story:** As a tenant administrator, I want to confirm before pausing a workflow, so that I understand the impact of pausing on triggers.

#### Acceptance Criteria

1. WHEN the Pause_Modal opens, THE Pause_Modal SHALL display the message "This will stop all scheduled and webhook triggers."
2. WHEN the user confirms the pause action, THE Pause_Modal SHALL send a POST request to `/api/workflows/{workflowId}/pause`
3. IF the pause API request succeeds, THEN THE Pause_Modal SHALL update the workflow status badge to PAUSED and close the modal
4. IF the pause API request fails, THEN THE Pause_Modal SHALL display an error message

### Requirement 13: Archive Confirmation Modal

**User Story:** As a tenant administrator, I want to be warned about archiving prerequisites, so that I do not accidentally archive a running workflow.

#### Acceptance Criteria

1. WHEN the Archive_Modal opens for a workflow with status PUBLISHED, THE Archive_Modal SHALL display a warning that the workflow must be paused before archiving
2. WHEN the Archive_Modal opens for a workflow with status DRAFT or PAUSED, THE Archive_Modal SHALL display a confirmation prompt to proceed with archiving
3. WHEN the user confirms the archive action, THE Archive_Modal SHALL send a POST request to `/api/workflows/{workflowId}/archive`
4. IF the archive API request succeeds, THEN THE Archive_Modal SHALL update the workflow status badge to ARCHIVED and close the modal
5. IF the archive API request fails, THEN THE Archive_Modal SHALL display an error message

### Requirement 14: Promote to Prod Modal

**User Story:** As a tenant administrator, I want to promote a dev workflow to production with a clear explanation of what happens, so that I can safely move workflows between environments.

#### Acceptance Criteria

1. WHEN the Promote_Modal opens, THE Promote_Modal SHALL display the message "Creates a new workflow in prod as a DRAFT. You must publish it separately."
2. WHEN the user clicks the confirm button, THE Promote_Modal SHALL send a POST request to `/api/workflows/{workflowId}/promote`
3. IF the promote API request succeeds, THEN THE Promote_Modal SHALL display a success toast containing a link to the new prod workflow at `/workflows/{newWorkflowId}`
4. IF the promote API request fails, THEN THE Promote_Modal SHALL display an error message

### Requirement 15: CronPickerModal Component

**User Story:** As a tenant administrator, I want to edit a cron schedule with real-time feedback, so that I can configure workflow schedules accurately.

#### Acceptance Criteria

1. THE CronPickerModal SHALL accept a 5-field cron expression as input
2. WHEN the user types a cron expression, THE CronPickerModal SHALL display a plain-language preview of the schedule in real-time
3. THE CronPickerModal SHALL validate that the cron expression specifies a minimum interval of 15 minutes
4. IF the cron expression specifies an interval shorter than 15 minutes, THEN THE CronPickerModal SHALL display a validation error message
5. THE CronPickerModal SHALL display the next 3 run times based on the current cron expression

### Requirement 16: Shared Components

**User Story:** As a developer, I want reusable UI components for workflow status badges and step summaries, so that the UI is consistent across pages.

#### Acceptance Criteria

1. THE WorkflowStatusBadge SHALL accept a status string and render a color-coded pill badge using the color scheme: DRAFT (slate), PUBLISHED (emerald), PAUSED (amber), ARCHIVED (rose)
2. THE StepSummaryCard SHALL accept a step index, connector icon identifier, label, and parameter values, and render a card displaying the step information
3. WHEN the StepSummaryCard receives parameter values containing secret references, THE StepSummaryCard SHALL display masked placeholder text instead of the actual secret values

### Requirement 17: Dashboard Navigation

**User Story:** As a tenant administrator, I want a "Workflows" link in the dashboard sidebar navigation, so that I can access the workflow management pages from anywhere in the dashboard.

#### Acceptance Criteria

1. THE Dashboard_Sidebar_Nav SHALL include a "Workflows" navigation link
2. THE Dashboard_Sidebar_Nav SHALL position the "Workflows" link between the "Recipes" link and the "Connections" link
3. WHEN the user clicks the "Workflows" link, THE Dashboard_Sidebar_Nav SHALL navigate to `/workflows`
