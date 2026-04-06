# Requirements Document

## Introduction

The Workflow Management API provides the backend layer for CourseForge Connect that enables tenants to create, version, publish, pause, and archive workflows. Workflows are compiled from recipes with user-supplied parameters and connection references, stored in DynamoDB using a single-table design, and lifecycle events are published to EventBridge. The API includes semver-based versioning, a recipe-to-step compilation pipeline, and audit logging for all state transitions.

## Glossary

- **Workflow_API**: The set of API route handlers that manage workflow CRUD and lifecycle operations
- **Workflow_Record**: A DynamoDB item representing a workflow, keyed by `PK: TENANT#{tenantId}`, `SK: WORKFLOW#{workflowId}`
- **WorkflowVersion_Record**: An immutable DynamoDB item representing a published version of a workflow, keyed by `PK: WORKFLOW#{workflowId}`, `SK: VERSION#{semver}`
- **WorkflowStatus**: An enum with values DRAFT, PUBLISHED, PAUSED, ARCHIVED representing the lifecycle state of a workflow
- **Recipe**: A template definition in the recipe registry containing steps, parameter schemas, and connection requirements
- **StepDefinition**: A compiled step object containing stepId, stepIndex, connectorKey, actionType, params, and retryPolicy, ready for Step Functions execution
- **Compiled_Plan**: An array of StepDefinition objects produced by merging a recipe with user-supplied parameters and resolved connection references
- **Semver_Utility**: A utility module providing semantic version parsing, bumping, and comparison functions
- **Compilation_Utility**: A utility module that compiles a recipe plus parameters and connections into a Compiled_Plan
- **CompilationError**: An error type thrown by the Compilation_Utility containing a field name and descriptive message
- **Connection_Record**: A DynamoDB item representing a tenant's configured connection with status, secretRef, and connector metadata
- **Audit_Log_Entry**: A DynamoDB item recording a workflow lifecycle action with actionType, actor, resourceId, and timestamp
- **EventBridge_Publisher**: The component responsible for publishing domain events to AWS EventBridge
- **Tenant**: An organizational entity that owns workflows and connections, identified by tenantId

## Requirements

### Requirement 1: Create Workflow

**User Story:** As a tenant administrator, I want to create a new workflow from a recipe with my parameters and connections, so that I can begin configuring an automation pipeline.

#### Acceptance Criteria

1. WHEN a POST request is received at `/api/workflows` with a valid body containing name, description, recipeId, params, environmentId, and connectionIds, THE Workflow_API SHALL validate that the recipeId exists in the recipe registry
2. WHEN a POST request is received at `/api/workflows`, THE Workflow_API SHALL validate that all required parameters defined by the recipe step schemas are present in the params payload
3. WHEN a POST request is received at `/api/workflows`, THE Workflow_API SHALL validate that all connectionIds exist, belong to the requesting Tenant, and have status equal to "active"
4. WHEN all validations pass, THE Compilation_Utility SHALL compile the recipe and params into a Compiled_Plan by merging each RecipeStep's params with user-supplied params and resolving connectionId references into secretRef values from DynamoDB
5. WHEN compilation succeeds, THE Workflow_API SHALL write a Workflow_Record to DynamoDB with status set to DRAFT and a generated workflowId
6. WHEN compilation succeeds, THE Workflow_API SHALL write a WorkflowVersion_Record to DynamoDB with semver set to "0.1.0", the Compiled_Plan, and a paramSnapshot of the wizard params at creation time
7. WHEN the Workflow_Record and WorkflowVersion_Record are written successfully, THE Workflow_API SHALL return a response containing workflowId, versionId, and status "DRAFT" with HTTP status 201
8. IF the recipeId does not exist in the recipe registry, THEN THE Workflow_API SHALL return HTTP status 400 with a descriptive error message
9. IF any required parameter is missing from the params payload, THEN THE Workflow_API SHALL return HTTP status 400 with an error identifying the missing parameter
10. IF any connectionId does not exist, does not belong to the Tenant, or has a status other than "active", THEN THE Workflow_API SHALL return HTTP status 400 with an error identifying the invalid connection

### Requirement 2: List Workflows

**User Story:** As a tenant administrator, I want to list all workflows belonging to my tenant, so that I can view and manage my automation pipelines.

#### Acceptance Criteria

1. WHEN a GET request is received at `/api/workflows`, THE Workflow_API SHALL query DynamoDB using PK `TENANT#{tenantId}` with SK beginning with `WORKFLOW#`
2. WHEN the optional query parameter "status" is provided, THE Workflow_API SHALL filter the results to include only workflows matching the specified WorkflowStatus
3. WHEN the optional query parameter "environmentId" is provided, THE Workflow_API SHALL filter the results to include only workflows matching the specified environmentId
4. THE Workflow_API SHALL return a response containing a "workflows" array of Workflow_Record objects with HTTP status 200
5. WHEN both "status" and "environmentId" query parameters are provided, THE Workflow_API SHALL apply both filters to the results

### Requirement 3: Get Workflow Detail

**User Story:** As a tenant administrator, I want to view the details of a specific workflow including its current version's step summary, so that I can understand the workflow configuration.

#### Acceptance Criteria

1. WHEN a GET request is received at `/api/workflows/:workflowId`, THE Workflow_API SHALL return the Workflow_Record for the specified workflowId
2. WHEN the Workflow_Record has a currentVersionId, THE Workflow_API SHALL include a summary of the current WorkflowVersion_Record's Compiled_Plan containing step names only
3. THE Workflow_API SHALL exclude secretRef values from the Compiled_Plan summary returned in the response
4. IF the specified workflowId does not exist for the requesting Tenant, THEN THE Workflow_API SHALL return HTTP status 404 with a descriptive error message

### Requirement 4: Publish Workflow

**User Story:** As a tenant administrator, I want to publish a draft workflow so that it becomes active and can be triggered by events or schedules.

#### Acceptance Criteria

1. WHEN a POST request is received at `/api/workflows/:workflowId/publish`, THE Workflow_API SHALL fetch the Workflow_Record for the specified workflowId
2. IF the Workflow_Record has status equal to PUBLISHED, THEN THE Workflow_API SHALL return HTTP status 409 with a descriptive error message
3. WHEN the workflow status is not PUBLISHED, THE Workflow_API SHALL fetch the current WorkflowVersion_Record and validate that all connectionIds referenced in the workflow are still active
4. WHEN the Compiled_Plan contains a trigger step with triggerType equal to "webhook", THE Workflow_API SHALL verify that a webhook secret exists for the workflow
5. WHEN the Compiled_Plan contains a trigger step with triggerType equal to "scheduled", THE Workflow_API SHALL verify that a schedule record exists and is enabled for the workflow
6. WHEN all publish validations pass, THE Semver_Utility SHALL bump the current semver to the next minor version
7. WHEN the semver is bumped, THE Workflow_API SHALL create a new immutable WorkflowVersion_Record with the new semver and the current Compiled_Plan
8. WHEN the new WorkflowVersion_Record is created, THE Workflow_API SHALL update the Workflow_Record with status set to PUBLISHED, currentVersionId set to the new versionId, and updatedAt set to the current timestamp
9. WHEN the Workflow_Record is updated, THE EventBridge_Publisher SHALL publish a domain event with source "courseforge.workflow", detail-type "WorkflowPublished", and detail containing tenantId, workflowId, and versionId
10. WHEN the domain event is published, THE Workflow_API SHALL write an Audit_Log_Entry with actionType "WORKFLOW_PUBLISHED"
11. WHEN all publish operations complete, THE Workflow_API SHALL return a response containing workflowId, versionId, and status "PUBLISHED" with HTTP status 200
12. IF any connectionId referenced in the workflow is no longer active, THEN THE Workflow_API SHALL return HTTP status 400 with an error identifying the inactive connection
13. IF a required webhook secret does not exist for a webhook trigger step, THEN THE Workflow_API SHALL return HTTP status 400 with a descriptive error message
14. IF a required schedule record does not exist or is not enabled for a scheduled trigger step, THEN THE Workflow_API SHALL return HTTP status 400 with a descriptive error message

### Requirement 5: Pause Workflow

**User Story:** As a tenant administrator, I want to pause a published workflow so that it stops processing triggers while I investigate or make changes.

#### Acceptance Criteria

1. WHEN a POST request is received at `/api/workflows/:workflowId/pause`, THE Workflow_API SHALL fetch the Workflow_Record for the specified workflowId
2. IF the Workflow_Record has a status other than PUBLISHED, THEN THE Workflow_API SHALL return HTTP status 409 with a descriptive error message
3. WHEN the workflow status is PUBLISHED, THE Workflow_API SHALL update the Workflow_Record status to PAUSED and set updatedAt to the current timestamp
4. WHEN the workflow is paused, THE Workflow_API SHALL disable all EventBridge Scheduler schedules associated with the workflow
5. WHEN the workflow is paused, THE Workflow_API SHALL write an Audit_Log_Entry with actionType "WORKFLOW_PAUSED"
6. WHEN all pause operations complete, THE Workflow_API SHALL return a response containing workflowId and status "PAUSED" with HTTP status 200

### Requirement 6: Archive Workflow

**User Story:** As a tenant administrator, I want to archive a workflow that is no longer needed, so that it is removed from active management without being deleted.

#### Acceptance Criteria

1. WHEN a POST request is received at `/api/workflows/:workflowId/archive`, THE Workflow_API SHALL fetch the Workflow_Record for the specified workflowId
2. IF the Workflow_Record has status equal to PUBLISHED, THEN THE Workflow_API SHALL return HTTP status 409 with a descriptive error message indicating the workflow must be paused before archiving
3. WHEN the workflow status is DRAFT or PAUSED, THE Workflow_API SHALL update the Workflow_Record status to ARCHIVED and set updatedAt to the current timestamp
4. WHEN the workflow is archived, THE Workflow_API SHALL write an Audit_Log_Entry with actionType "WORKFLOW_ARCHIVED"
5. WHEN all archive operations complete, THE Workflow_API SHALL return a response containing workflowId and status "ARCHIVED" with HTTP status 200

### Requirement 7: List Workflow Versions

**User Story:** As a tenant administrator, I want to view the version history of a workflow, so that I can track changes and understand the evolution of the workflow configuration.

#### Acceptance Criteria

1. WHEN a GET request is received at `/api/workflows/:workflowId/versions`, THE Workflow_API SHALL query DynamoDB using PK `WORKFLOW#{workflowId}` with SK beginning with `VERSION#`
2. THE Workflow_API SHALL return versions sorted by semver in descending order with the latest version first
3. THE Workflow_API SHALL exclude the compiledPlan field from each version in the response to prevent exposure of secretRef values
4. THE Workflow_API SHALL return only version metadata including versionId, workflowId, semver, createdBy, createdAt, recipeId, and paramSnapshot with HTTP status 200

### Requirement 8: Semver Utility

**User Story:** As a developer, I want a reliable semver utility for bumping and comparing semantic versions, so that workflow versioning is consistent and correct.

#### Acceptance Criteria

1. WHEN bumpMinor is called with a valid semver string, THE Semver_Utility SHALL return a new semver string with the minor version incremented by one and the patch version reset to zero
2. WHEN bumpPatch is called with a valid semver string, THE Semver_Utility SHALL return a new semver string with the patch version incremented by one
3. WHEN compareSemver is called with two semver strings, THE Semver_Utility SHALL return -1 when the first version is less than the second, 0 when they are equal, and 1 when the first version is greater than the second
4. FOR ALL valid semver strings, parsing then formatting a semver string SHALL produce an equivalent string (round-trip property)
5. FOR ALL valid semver strings v, compareSemver(v, v) SHALL return 0 (reflexive property)
6. FOR ALL valid semver strings a and b, compareSemver(a, b) SHALL return the negation of compareSemver(b, a) (antisymmetric property)
7. FOR ALL valid semver strings v, bumpMinor(v) SHALL produce a version that is greater than v when compared using compareSemver
8. FOR ALL valid semver strings v, bumpPatch(v) SHALL produce a version that is greater than v when compared using compareSemver

### Requirement 9: Compilation Utility

**User Story:** As a developer, I want a compilation utility that transforms a recipe and user parameters into an executable step plan, so that workflows can be reliably executed by Step Functions.

#### Acceptance Criteria

1. WHEN compilePlan is called with a valid recipe, params, and connections array, THE Compilation_Utility SHALL return an array of StepDefinition objects with all parameter templates resolved
2. WHEN a recipe step contains mustache-style `{{ }}` parameter templates, THE Compilation_Utility SHALL substitute the template placeholders with the corresponding values from the params record
3. WHEN a recipe step references a connectionKey, THE Compilation_Utility SHALL resolve the connectionKey to the corresponding secretRef ARN from the connections array
4. IF a required parameter defined in the recipe is missing from the params record, THEN THE Compilation_Utility SHALL throw a CompilationError with the field name and a descriptive message
5. IF a recipe step references a connectionKey that does not exist in the connections array, THEN THE Compilation_Utility SHALL throw a CompilationError with the field name and a descriptive message
6. FOR ALL valid recipe, params, and connections inputs, the number of StepDefinition objects in the output SHALL equal the number of steps in the input recipe (size invariant)
7. FOR ALL valid compilePlan inputs, each StepDefinition in the output SHALL contain no unresolved `{{ }}` template placeholders (completeness property)
