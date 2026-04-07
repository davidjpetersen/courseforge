# Implementation Plan: Workflow Management API

## Overview

Implement the Workflow Management API by extracting pure logic functions into `src/api/workflows/logic.ts`, adding unit tests for all seven handler factories in `src/api/workflows/handlers.test.ts`, and writing property-based tests for correctness properties defined in the design. The existing handler stubs in `handlers.ts` are already implemented — the work focuses on the logic layer, tests, and property tests. Semver and compilation utilities are already implemented and tested; their property tests are additive.

## Tasks

- [x] 1. Create pure logic module with workflow filtering, state machine, and utility functions
  - [x] 1.1 Create `src/api/workflows/logic.ts` with pure functions
    - Implement `filterWorkflows(workflows, statusFilter?, envFilter?)` that filters by status and/or environmentId
    - Implement `isValidTransition(from: WorkflowStatus, to: WorkflowStatus)` returning boolean for the five valid transitions (DRAFT→PUBLISHED, DRAFT→ARCHIVED, PUBLISHED→PAUSED, PAUSED→PUBLISHED, PAUSED→ARCHIVED)
    - Implement `getTransitionError(from, to)` returning descriptive error messages for invalid transitions
    - Implement `summarizeSteps(compiledPlan: StepDefinition[])` extracting step names, excluding secretRef values
    - Implement `sortVersionsDescending(versions: WorkflowVersionRecord[])` using `compareSemver` for descending sort
    - Implement `toVersionMetadata(version: WorkflowVersionRecord)` projecting only versionId, workflowId, semver, createdBy, createdAt, recipeId
    - Implement `validateCreateRequest(body: unknown)` validating name, recipeId, environmentId, connectionIds fields
    - Export all types needed by handlers and tests
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 2.4, 2.5, 2.6, 3.5, 3.6, 7.4, 7.5, 10.1, 10.2, 10.3_

  - [x] 1.2 Write property test: Workflow List Filtering (Property 3)
    - **Property 3: Workflow List Filtering**
    - For any array of workflow records and optional status/environmentId filters, `filterWorkflows` returns exactly the matching subset
    - Create `src/api/workflows/logic.property.test.ts`
    - **Validates: Requirements 2.4, 2.5, 2.6**

  - [x] 1.3 Write property test: Step Summary Correctness (Property 4)
    - **Property 4: Step Summary Correctness**
    - For any array of StepDefinition objects, `summarizeSteps` returns step names in order with no secretRef values
    - **Validates: Requirements 3.5, 3.6**

  - [x] 1.4 Write property test: Version Sorting by Semver Descending (Property 5)
    - **Property 5: Version Sorting by Semver Descending**
    - For any array of WorkflowVersionRecord objects, `sortVersionsDescending` returns versions where each adjacent pair satisfies `compareSemver(a.semver, b.semver) >= 0`
    - **Validates: Requirements 7.4**

  - [x] 1.5 Write property test: Version Metadata Projection (Property 6)
    - **Property 6: Version Metadata Projection**
    - For any WorkflowVersionRecord, `toVersionMetadata` returns only the six metadata fields and excludes compiledPlan and paramSnapshot
    - **Validates: Requirements 7.5**

  - [x] 1.6 Write property test: Workflow Lifecycle State Machine (Property 17)
    - **Property 17: Workflow Lifecycle State Machine**
    - For any pair of WorkflowStatus values, `isValidTransition` returns true if and only if the pair is one of the five valid transitions; all others including transitions from ARCHIVED return false
    - **Validates: Requirements 10.1, 10.2, 10.3**

- [x] 2. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Wire logic functions into existing handlers and add handler unit tests
  - [x] 3.1 Refactor `src/api/workflows/handlers.ts` to use logic.ts functions
    - Import and use `filterWorkflows` in `createListWorkflowsHandler`
    - Import and use `summarizeSteps` from logic.ts in `createGetWorkflowHandler` (replace inline implementation)
    - Import and use `sortVersionsDescending` and `toVersionMetadata` in `createListWorkflowVersionsHandler` (replace inline sort/map)
    - Update `src/api/workflows/index.ts` to re-export logic functions and types
    - _Requirements: 2.4, 2.5, 2.6, 3.5, 3.6, 7.4, 7.5_

  - [x] 3.2 Write unit tests for Create Workflow handler
    - Create `src/api/workflows/handlers.test.ts`
    - Test valid creation returns 201 with workflowId, versionId, status DRAFT
    - Test missing body returns 400
    - Test missing tenantId returns 400
    - Test missing name returns 400
    - Test unknown recipeId returns 400
    - Test inactive connection returns 400
    - Test compilation error returns 400
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, 1.14_

  - [x] 3.3 Write unit tests for List Workflows handler
    - Test returns all workflows for tenant with 200
    - Test filters by status query parameter
    - Test filters by environmentId query parameter
    - Test both filters combined
    - Test missing tenantId returns 400
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 3.4 Write unit tests for Get Workflow handler
    - Test returns workflow with currentVersionSummary with 200
    - Test missing workflow returns 404
    - Test missing tenantId or workflowId returns 400
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 3.5 Write unit tests for Publish Workflow handler
    - Test successful publish from DRAFT returns 200 with new versionId
    - Test successful re-publish from PAUSED returns 200
    - Test already published returns 409
    - Test missing webhook secret returns 400
    - Test missing schedule returns 400
    - Test inactive connection returns 400
    - Test workflow not found returns 404
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, 4.13, 4.14, 4.15, 4.16, 4.17_

  - [x] 3.6 Write unit tests for Pause Workflow handler
    - Test successful pause returns 200
    - Test non-published workflow returns 409
    - Test verifies schedules are disabled
    - Test workflow not found returns 404
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9_

  - [x] 3.7 Write unit tests for Archive Workflow handler
    - Test successful archive from DRAFT returns 200
    - Test successful archive from PAUSED returns 200
    - Test published workflow returns 409
    - Test ARCHIVED workflow returns 409
    - Test workflow not found returns 404
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

  - [x] 3.8 Write unit tests for List Workflow Versions handler
    - Test returns versions sorted descending by semver with 200
    - Test excludes compiledPlan and paramSnapshot from response
    - Test missing workflowId returns 400
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Add validation property tests for create request and connection status
  - [x] 5.1 Write property test: Create Workflow Request Validation (Property 1)
    - **Property 1: Create Workflow Request Validation**
    - For any JSON body, the validator accepts if and only if it contains non-empty string name, non-empty string recipeId, environmentId of "dev" or "prod", and connectionIds array of strings
    - Add to `src/api/workflows/logic.property.test.ts`
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**

  - [x] 5.2 Write property test: Connection Status Validation (Property 2)
    - **Property 2: Connection Status Validation**
    - For any set of connection records with mixed statuses and requested connectionIds, the validator accepts if and only if every requested connectionId exists and has status "active"
    - Add to `src/api/workflows/logic.property.test.ts`
    - **Validates: Requirements 1.8, 1.9, 4.6, 4.7**

- [x] 6. Add semver property tests
  - [x] 6.1 Write property test: Semver Round-Trip (Property 7)
    - **Property 7: Semver Round-Trip**
    - For any tuple of three non-negative integers, formatting as "major.minor.patch" then parsing produces the original tuple
    - Create `packages/utils/src/semver.property.test.ts`
    - **Validates: Requirements 8.1, 8.6**

  - [x] 6.2 Write property test: Semver Comparison Total Order (Property 8)
    - **Property 8: Semver Comparison Total Order**
    - For any valid semver strings a, b, c: reflexive, antisymmetric, and transitive properties hold
    - **Validates: Requirements 8.5, 8.7, 8.8**

  - [x] 6.3 Write property test: bumpMinor Correctness (Property 9)
    - **Property 9: bumpMinor Correctness**
    - For any valid semver, bumpMinor returns "major.(minor+1).0" and compareSemver(bumpMinor(v), v) returns 1
    - **Validates: Requirements 8.3, 8.9**

  - [x] 6.4 Write property test: bumpPatch Correctness (Property 10)
    - **Property 10: bumpPatch Correctness**
    - For any valid semver, bumpPatch returns "major.minor.(patch+1)" and compareSemver(bumpPatch(v), v) returns 1
    - **Validates: Requirements 8.4, 8.10**

  - [x] 6.5 Write property test: Invalid Semver Rejection (Property 11)
    - **Property 11: Invalid Semver Rejection**
    - For any string not matching "digits.digits.digits", parseSemver throws an Error
    - **Validates: Requirements 8.2**

- [x] 7. Add compilation utility property tests
  - [x] 7.1 Write property test: Compilation Size Invariant (Property 12)
    - **Property 12: Compilation Size Invariant**
    - For any valid recipe, params, and connections, compilePlan output length equals the number of recipe steps
    - Create `packages/utils/src/compile-plan.property.test.ts`
    - **Validates: Requirements 9.1, 9.8**

  - [x] 7.2 Write property test: Compilation Completeness (Property 13)
    - **Property 13: Compilation Completeness**
    - For any valid inputs, every string value in the compiled output contains no unresolved `{{ }}` placeholders
    - **Validates: Requirements 9.2, 9.4, 9.9**

  - [x] 7.3 Write property test: Compilation ConnectionKey Resolution (Property 14)
    - **Property 14: Compilation ConnectionKey Resolution**
    - For any recipe step with a connectionKey and a matching connection, the compiled output includes the corresponding secretRef
    - **Validates: Requirements 9.3**

  - [x] 7.4 Write property test: Compilation Rejects Missing Required Params (Property 15)
    - **Property 15: Compilation Rejects Missing Required Params**
    - For any recipe with requiredParams and a params record missing at least one, compilePlan throws CompilationError with the correct field
    - **Validates: Requirements 9.5**

  - [x] 7.5 Write property test: Compilation Rejects Unresolvable References (Property 16)
    - **Property 16: Compilation Rejects Unresolvable References**
    - For any recipe step with a template referencing a missing param or a connectionKey not in connections, compilePlan throws CompilationError
    - **Validates: Requirements 9.6, 9.7**

- [x] 8. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- The existing `handlers.ts` already contains complete handler implementations — task 1 creates the logic layer, task 3 wires it in
- Semver utility (`packages/utils/src/semver.ts`) and compilation utility (`packages/utils/src/compile-plan.ts`) are already implemented and tested — tasks 6 and 7 add property-based tests only
- Property tests use `fast-check` with `{ numRuns: 100 }` configuration
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
