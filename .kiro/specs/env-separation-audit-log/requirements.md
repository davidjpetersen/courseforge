# Requirements Document

## Introduction

Environment Separation and Audit Log adds two foundational capabilities to CourseForge Connect: (1) a dev/prod environment model that scopes workflows and runs by environment, supports promotion of workflows from dev to prod, and seeds default environments during tenant creation; and (2) a formalized, centralized audit log system that records all security-relevant and lifecycle actions across the platform, with an admin-only query API, CSV export, and a read-only UI.

The stack is Next.js API routes, DynamoDB (single-table design already in place), and TypeScript. No new AWS infrastructure is required beyond what is already provisioned. The existing `AUDIT#` SK prefix in `src/models/schema.ts` is reused and the audit record schema is expanded to cover all action types across the platform.

## Glossary

- **Environment_Record**: A DynamoDB item representing a deployment environment for a Tenant, keyed by PK `TENANT#{tenantId}`, SK `ENV#{environmentId}`. Fields include environmentId, tenantId, name, description, createdAt, and isDefault.
- **Environment_API**: The set of Next.js API route handlers that manage environment listing and environment-scoped workflow queries.
- **Tenant_Bootstrap**: A utility function at `/app/lib/tenant-bootstrap.ts` that seeds a new Tenant with its Tenant record, two default Environment_Records (dev and prod), and an initial audit log entry.
- **Workflow_Record**: An existing DynamoDB item representing a workflow, keyed by PK `TENANT#{tenantId}`, SK `WORKFLOW#{workflowId}`. The environmentId field is already present on Workflow_Records.
- **WorkflowVersion_Record**: An existing immutable DynamoDB item representing a published version of a workflow, keyed by PK `WORKFLOW#{workflowId}`, SK `VERSION#{semver}`.
- **Promotion_API**: The API route handler at POST `/api/workflows/:workflowId/promote` that copies a published dev workflow into the prod environment as a new DRAFT workflow.
- **Audit_Entry**: A DynamoDB item recording a platform action, keyed by PK `TENANT#{tenantId}`, SK `AUDIT#{ISO-timestamp}#{auditId}`. Fields include auditId, tenantId, actor, actorEmail, actionType, resourceType, resourceId, detail, ipAddress, userAgent, and timestamp.
- **Audit_Utility**: A utility function at `/packages/utils/src/audit.ts` that is the sole entry point for writing Audit_Entry records to DynamoDB.
- **Audit_API**: The set of Next.js API route handlers for querying and exporting audit log entries, restricted to Admin role users.
- **Audit_Log_UI**: The admin-only page at `/app/(dashboard)/admin/audit/page.tsx` that displays audit entries in a filterable, paginated, read-only table with CSV export.
- **Environment_Context**: A React context at `/app/context/EnvironmentContext.tsx` that stores the currently selected environment (dev or prod) and persists the selection in localStorage under key `courseforge_env`.
- **Environment_Selector**: A UI pill component (Dev / Prod toggle) displayed at the top of dashboard pages to switch the active environment.
- **Action_Type**: A TypeScript enum at `/packages/types/src/audit.ts` defining all allowed audit action types: TENANT_CREATED, USER_INVITED, USER_ROLE_CHANGED, CONNECTION_CREATED, CONNECTION_TESTED, CONNECTION_ROTATED, CONNECTION_DELETED, WORKFLOW_CREATED, WORKFLOW_PUBLISHED, WORKFLOW_PAUSED, WORKFLOW_ARCHIVED, WORKFLOW_PROMOTED, RUN_COMPLETED, RUN_FAILED, RUN_REPLAYED, AUDIT_LOG_EXPORTED.
- **Resource_Type**: A union type representing the kind of resource an audit entry pertains to: `'workflow' | 'connection' | 'run' | 'user' | 'environment'`.
- **Admin**: A user with the Admin role within a Tenant, authorized to access audit log endpoints and the audit log UI.

## Requirements

### Requirement 1: Tenant Bootstrap with Default Environments

**User Story:** As a platform operator, I want new tenants to be automatically provisioned with dev and prod environments, so that environment separation is available from the moment a tenant is created.

#### Acceptance Criteria

1. WHEN `bootstrapTenant` is called with a valid tenantId and adminUserId, THE Tenant_Bootstrap SHALL create a Tenant record in DynamoDB with PK `TENANT#{tenantId}` and SK `META`.
2. WHEN the Tenant record is created, THE Tenant_Bootstrap SHALL create two Environment_Records: one with environmentId `dev` (isDefault: true) and one with environmentId `prod` (isDefault: false), both under PK `TENANT#{tenantId}`.
3. WHEN both Environment_Records are created, THE Tenant_Bootstrap SHALL write an Audit_Entry with actionType `TENANT_CREATED`, actor set to the adminUserId, and resourceType `environment`.
4. WHEN `bootstrapTenant` is called from POST `/api/auth/register`, THE Tenant_Bootstrap SHALL execute all writes (Tenant record, two Environment_Records, Audit_Entry) before the registration response is returned.
5. IF any DynamoDB write fails during bootstrapping, THEN THE Tenant_Bootstrap SHALL propagate the error to the caller without silently swallowing the failure.

### Requirement 2: Environment Limit Enforcement

**User Story:** As a platform operator, I want to restrict each tenant to exactly two environments (dev and prod), so that additional environments remain a future paid-tier feature.

#### Acceptance Criteria

1. IF a request attempts to create a third Environment_Record for a Tenant that already has two Environment_Records, THEN THE Environment_API SHALL reject the request with HTTP status 403 and a descriptive error message indicating the environment limit has been reached.
2. THE Environment_API SHALL count existing Environment_Records for the Tenant by querying DynamoDB with PK `TENANT#{tenantId}` and SK beginning with `ENV#` before allowing creation.

### Requirement 3: List Environments

**User Story:** As a tenant administrator, I want to view my available environments with workflow counts, so that I can understand the state of each environment at a glance.

#### Acceptance Criteria

1. WHEN a GET request is received at `/api/environments`, THE Environment_API SHALL return the Environment_Records for the authenticated Tenant by querying DynamoDB with PK `TENANT#{tenantId}` and SK beginning with `ENV#`.
2. FOR EACH Environment_Record in the response, THE Environment_API SHALL include a `workflowCount` field derived by querying the count of Workflow_Records matching that environmentId.
3. THE Environment_API SHALL return a response containing an `environments` array with HTTP status 200.
4. IF the tenantId is missing from the request, THEN THE Environment_API SHALL return HTTP status 400 with a descriptive error message.

### Requirement 4: List Workflows by Environment

**User Story:** As a tenant administrator, I want to view workflows filtered by environment, so that I can manage dev and prod workflows separately.

#### Acceptance Criteria

1. WHEN a GET request is received at `/api/environments/:environmentId/workflows`, THE Environment_API SHALL validate that environmentId is either `dev` or `prod`.
2. IF the environmentId is not `dev` or `prod`, THEN THE Environment_API SHALL return HTTP status 400 with a descriptive error message.
3. WHEN the environmentId is valid, THE Environment_API SHALL query Workflow_Records for the authenticated Tenant filtered by the specified environmentId.
4. THE Environment_API SHALL return a response containing a `workflows` array and the `environmentId` with HTTP status 200.

### Requirement 5: Workflow Promotion from Dev to Prod

**User Story:** As a tenant administrator, I want to promote a published dev workflow to the prod environment, so that I can deploy tested automations to production.

#### Acceptance Criteria

1. WHEN a POST request is received at `/api/workflows/:workflowId/promote`, THE Promotion_API SHALL fetch the Workflow_Record for the specified workflowId and verify that the workflow belongs to the authenticated Tenant.
2. IF the Workflow_Record does not exist for the authenticated Tenant, THEN THE Promotion_API SHALL return HTTP status 404 with a descriptive error message.
3. IF the Workflow_Record has an environmentId other than `dev`, THEN THE Promotion_API SHALL return HTTP status 400 with a message indicating that only dev workflows can be promoted.
4. IF the Workflow_Record has a status other than PUBLISHED, THEN THE Promotion_API SHALL return HTTP status 400 with a message indicating that only published workflows can be promoted.
5. WHEN the workflow is in the dev environment with PUBLISHED status, THE Promotion_API SHALL create a new Workflow_Record in the prod environment with a newly generated workflowId, environmentId set to `prod`, status set to DRAFT, and createdBy set to the promoting user's userId.
6. WHEN the new prod Workflow_Record is created, THE Promotion_API SHALL copy the source workflow's current WorkflowVersion_Record's compiledPlan into a new WorkflowVersion_Record associated with the new prod workflowId.
7. WHEN the promotion writes complete, THE Promotion_API SHALL write an Audit_Entry with actionType `WORKFLOW_PROMOTED` and detail containing `sourceWorkflowId` and `targetWorkflowId`.
8. WHEN all promotion operations complete, THE Promotion_API SHALL return a response containing `newWorkflowId`, `environmentId: 'prod'`, and `status: 'DRAFT'` with HTTP status 201.

### Requirement 6: Environment Context and UI Selector

**User Story:** As a tenant administrator, I want to switch between dev and prod environments in the dashboard, so that I can view and manage resources scoped to each environment.

#### Acceptance Criteria

1. THE Environment_Context SHALL store the currently selected environmentId (`dev` or `prod`) and provide it to all child components via React context.
2. THE Environment_Context SHALL persist the selected environmentId in localStorage under the key `courseforge_env`.
3. WHEN the dashboard loads and no value exists in localStorage for `courseforge_env`, THE Environment_Context SHALL default to `dev`.
4. THE Environment_Selector SHALL render a pill toggle (Dev / Prod) at the top of the workflows page, runs page, and recipes page.
5. WHEN the user selects an environment in the Environment_Selector, THE Environment_Context SHALL update the stored environmentId and trigger a re-fetch of environment-scoped data.
6. WHEN the workflows page is displayed, THE Environment_Context SHALL filter the workflow list by the selected environmentId.
7. WHEN the runs page is displayed, THE Environment_Context SHALL filter runs by the environmentId of the parent workflow.
8. WHEN the recipes page is displayed, THE Environment_Selector SHALL be visible but no environment filter SHALL be applied to the recipe list (recipes are global).

### Requirement 7: Promote to Prod Button on Workflow Detail

**User Story:** As a tenant administrator, I want a visible action to promote a workflow from the workflow detail page, so that I can initiate promotion without navigating away.

#### Acceptance Criteria

1. WHEN the workflow detail page is displayed for a workflow with environmentId `dev` and status PUBLISHED, THE Workflow_Detail_Page SHALL render a "Promote to prod" button.
2. WHEN the workflow detail page is displayed for a workflow with environmentId `prod` or status other than PUBLISHED, THE Workflow_Detail_Page SHALL hide the "Promote to prod" button.
3. WHEN the user clicks the "Promote to prod" button, THE Workflow_Detail_Page SHALL send a POST request to `/api/workflows/:workflowId/promote` and display the result (new workflowId and status) on success, or an error message on failure.

### Requirement 8: Audit Entry Data Model and Types

**User Story:** As a developer, I want a well-defined audit entry schema and TypeScript types, so that audit records are consistent and type-safe across the platform.

#### Acceptance Criteria

1. THE Audit_Entry SHALL be stored in DynamoDB with PK `TENANT#{tenantId}` and SK `AUDIT#{ISO-timestamp}#{auditId}`, where auditId is a UUID v4.
2. THE Audit_Entry SHALL contain the fields: auditId, tenantId, actor (userId or `system`), actorEmail, actionType (from the Action_Type enum), resourceType (from the Resource_Type union), resourceId, detail (Record<string, unknown>), ipAddress, userAgent, and timestamp (ISO 8601).
3. THE Action_Type enum at `/packages/types/src/audit.ts` SHALL define exactly these values: TENANT_CREATED, USER_INVITED, USER_ROLE_CHANGED, CONNECTION_CREATED, CONNECTION_TESTED, CONNECTION_ROTATED, CONNECTION_DELETED, WORKFLOW_CREATED, WORKFLOW_PUBLISHED, WORKFLOW_PAUSED, WORKFLOW_ARCHIVED, WORKFLOW_PROMOTED, RUN_COMPLETED, RUN_FAILED, RUN_REPLAYED, AUDIT_LOG_EXPORTED.
4. FOR ALL Audit_Entry records, the SK SHALL be unique even when two entries share the same ISO timestamp, because the auditId UUID suffix guarantees uniqueness.

### Requirement 9: Audit Utility (writeAuditLog)

**User Story:** As a developer, I want a single centralized function for writing audit records, so that audit logging is consistent and audit writes are never bypassed.

#### Acceptance Criteria

1. WHEN `writeAuditLog` is called with a valid entry (all fields except auditId and timestamp), THE Audit_Utility SHALL generate a UUID v4 for auditId and an ISO 8601 string for timestamp, then write the complete Audit_Entry to DynamoDB using PutItem with no conditional expression.
2. THE Audit_Utility SHALL be the sole function used to write Audit_Entry records to DynamoDB across the entire codebase.
3. IF the DynamoDB PutItem operation fails, THEN THE Audit_Utility SHALL log the error to CloudWatch and rethrow the error to the caller.
4. THE Audit_Utility SHALL accept an entry of type `Omit<AuditEntry, 'auditId' | 'timestamp'>` and return `Promise<void>`.
5. FOR ALL calls to `writeAuditLog` with entries sharing the same ISO timestamp, the generated Audit_Entry records SHALL have distinct SK values due to unique auditId suffixes.

### Requirement 10: Query Audit Log

**User Story:** As a tenant administrator with Admin role, I want to query the audit log with filters, so that I can investigate actions taken within my organization.

#### Acceptance Criteria

1. WHEN a GET request is received at `/api/audit` from an Admin user, THE Audit_API SHALL query DynamoDB with PK `TENANT#{tenantId}` and SK beginning with `AUDIT#`.
2. WHEN optional query parameters are provided (actor, actionType, resourceType, resourceId, dateFrom, dateTo), THE Audit_API SHALL filter the results to include only entries matching all specified parameters.
3. THE Audit_API SHALL support pagination via `limit` (default 100) and `cursor` query parameters, returning a `nextCursor` value when more results are available.
4. THE Audit_API SHALL return a response containing an `entries` array of Audit_Entry objects and an optional `nextCursor` with HTTP status 200.
5. IF the requesting user does not have the Admin role, THEN THE Audit_API SHALL return HTTP status 403 with a descriptive error message.

### Requirement 11: Export Audit Log as CSV

**User Story:** As a tenant administrator with Admin role, I want to export the audit log as a CSV file, so that I can archive or analyze audit data in external tools.

#### Acceptance Criteria

1. WHEN a GET request is received at `/api/audit/export` from an Admin user, THE Audit_API SHALL query all matching Audit_Entry records using the same filter parameters as the query endpoint (actor, actionType, resourceType, resourceId, dateFrom, dateTo) without pagination.
2. THE Audit_API SHALL stream the results as a CSV response with `Content-Type: text/csv` and `Content-Disposition: attachment; filename="audit-log.csv"`.
3. THE CSV output SHALL contain columns: timestamp, actor, actorEmail, actionType, resourceType, resourceId, detail (JSON-stringified).
4. WHEN the CSV stream completes, THE Audit_API SHALL write an Audit_Entry with actionType `AUDIT_LOG_EXPORTED` and detail containing `recordCount` and `filterParams`.
5. IF the requesting user does not have the Admin role, THEN THE Audit_API SHALL return HTTP status 403 with a descriptive error message.

### Requirement 12: Audit Log UI

**User Story:** As a tenant administrator with Admin role, I want a dedicated audit log page in the admin dashboard, so that I can review platform activity in a structured, filterable view.

#### Acceptance Criteria

1. THE Audit_Log_UI at `/app/(dashboard)/admin/audit/page.tsx` SHALL display audit entries in a table with columns: timestamp, actor, action, resource, and detail summary.
2. THE Audit_Log_UI SHALL provide a filter bar with an action type dropdown, a date range picker, and an actor search input.
3. WHEN the user applies filters, THE Audit_Log_UI SHALL re-fetch audit entries from GET `/api/audit` with the corresponding query parameters.
4. THE Audit_Log_UI SHALL support cursor-based pagination with a "Load more" button that appends additional entries to the table.
5. THE Audit_Log_UI SHALL include an "Export CSV" button that triggers GET `/api/audit/export` with the currently applied filters and initiates a file download.
6. THE Audit_Log_UI SHALL be read-only with no delete, edit, or bulk action controls.
7. IF the current user does not have the Admin role, THEN THE Audit_Log_UI SHALL display a 403 forbidden page instead of the audit table.

### Requirement 13: writeAuditLog Unit Tests

**User Story:** As a developer, I want unit tests for the writeAuditLog utility, so that I can verify correct behavior and error handling of the audit write path.

#### Acceptance Criteria

1. WHEN `writeAuditLog` is called with a valid entry and DynamoDB PutItem succeeds, THE test SHALL verify that the function resolves without error.
2. WHEN `writeAuditLog` is called and DynamoDB PutItem throws an error, THE test SHALL verify that the error is rethrown to the caller (not silently swallowed).
3. WHEN `writeAuditLog` is called twice with entries that produce the same ISO timestamp, THE test SHALL verify that the two resulting SK values are distinct (due to different auditId UUID suffixes).
