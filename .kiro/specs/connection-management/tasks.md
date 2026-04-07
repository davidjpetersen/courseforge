# Implementation Plan: Connection Management

## Overview

Implement the credential lifecycle for CourseForge Connect — create, test, rotate, and delete integration credentials backed by DynamoDB metadata and Secrets Manager secret storage. The implementation follows the existing codebase patterns: pure logic functions in `logic.ts`, handler factories in `handlers.ts`, repository interfaces abstracting DynamoDB, and property-based testing with `fast-check`.

## Tasks

- [x] 1. Add dependencies and extend data model
  - [x] 1.1 Add `@aws-sdk/client-secrets-manager` and `ajv` to `package.json` dependencies
    - Run `npm install @aws-sdk/client-secrets-manager ajv`
    - _Requirements: 1.2, 7.2_

  - [x] 1.2 Add connection and audit types to `src/models/types.ts`
    - Add `ConnectionRecord`, `ConnectionListItem`, `SecretValue`, `AuditLogEntry`, `DependentWorkflow`, `TestResult`, and `ConnectorDefinition` interfaces
    - Add `ConnectionStatus` and `AuthType` type aliases
    - _Requirements: 1.3, 1.6, 2.2, 5.4, 7.2_

  - [x] 1.3 Extend `src/models/schema.ts` with connection and audit key builders
    - Add `CONNECTION#` and `AUDIT#` key prefixes to `KEY_PREFIX`
    - Add `connectionSK(connectionId)`, `auditSK(timestamp, uuid)` key builder functions
    - Add `buildSecretName(tenantId, connectionId)` helper
    - _Requirements: 1.2, 1.3, 5.4_

- [x] 2. Implement connector registry
  - [x] 2.1 Create `src/api/connections/registry.ts` with connector definitions
    - Export a `Map<string, ConnectorDefinition>` with entries for `canvas-lms`, `blackboard`, `brightspace`, `slack`, `smtp-email`, and `generic-http`
    - Each definition includes `key`, `displayName`, `authType`, `credentialSchema` (JSON Schema 7), and `testFn`
    - OAuth connectors (`brightspace`) return stub "Not yet implemented" from `testFn`
    - `canvas-lms` testFn performs GET `/api/v1/accounts`, `blackboard` testFn performs GET `/learn/api/public/v1/system/version`, `generic-http` testFn performs GET to base URL
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 2.2 Write property test: Registry definition completeness (Property 10)
    - **Property 10: Connector registry definition completeness**
    - **Validates: Requirements 7.2**
    - File: `src/api/connections/logic.property.test.ts`

  - [x] 2.3 Write property test: OAuth connector stub behavior (Property 11)
    - **Property 11: OAuth connector stub behavior**
    - **Validates: Requirements 7.6**
    - File: `src/api/connections/logic.property.test.ts`

- [x] 3. Implement pure logic functions
  - [x] 3.1 Create `src/api/connections/logic.ts` with `validateCredentials`
    - Use `ajv` to validate credentials against the connector's `credentialSchema`
    - Return `{ valid: true }` or `{ valid: false, errors: [{ field, message }] }`
    - _Requirements: 1.1, 1.5_

  - [x] 3.2 Add `mapConnectionToListItem` to `src/api/connections/logic.ts`
    - Map `ConnectionRecord` to `ConnectionListItem`, stripping `secretRef` and all credential fields
    - _Requirements: 1.6, 2.5, 3.2, 3.3_

  - [x] 3.3 Add `mapTestResultToStatus`, `filterDependentWorkflows`, `hasPublishedDependents`, and `buildAuditEntry` to `src/api/connections/logic.ts`
    - `mapTestResultToStatus`: maps `TestResult.success` to `'active'` or `'error'`
    - `filterDependentWorkflows`: filters workflows referencing a connectionId, returns `DependentWorkflow[]`
    - `hasPublishedDependents`: returns true if any dependent has active/published status
    - `buildAuditEntry`: constructs `AuditLogEntry` with ISO timestamp and DynamoDB keys
    - _Requirements: 2.2, 2.3, 4.1, 4.2, 5.4, 6.1, 6.2, 6.5_

  - [x] 3.4 Add `buildNewConnectionRecord` to `src/api/connections/logic.ts`
    - Constructs a `ConnectionRecord` with status `'pending'`, generated UUID, and `createdAt === updatedAt`
    - _Requirements: 1.3, 1.4_

  - [x] 3.5 Write property test: Credential validation correctness (Property 1)
    - **Property 1: Credential validation correctness**
    - **Validates: Requirements 1.1, 1.5**
    - File: `src/api/connections/logic.property.test.ts`

  - [x] 3.6 Write property test: Secret naming convention (Property 2)
    - **Property 2: Secret naming convention**
    - **Validates: Requirements 1.2**
    - File: `src/api/connections/logic.property.test.ts`

  - [x] 3.7 Write property test: New connection initial state (Property 3)
    - **Property 3: New connection initial state**
    - **Validates: Requirements 1.3**
    - File: `src/api/connections/logic.property.test.ts`

  - [x] 3.8 Write property test: Response credential exclusion (Property 4)
    - **Property 4: Response credential exclusion**
    - **Validates: Requirements 1.6, 2.5, 3.2, 3.3**
    - File: `src/api/connections/logic.property.test.ts`

  - [x] 3.9 Write property test: Test result to status mapping (Property 5)
    - **Property 5: Test result to status mapping**
    - **Validates: Requirements 2.2, 2.3, 2.4**
    - File: `src/api/connections/logic.property.test.ts`

  - [x] 3.10 Write property test: Dependency filtering correctness (Property 6)
    - **Property 6: Dependency filtering correctness**
    - **Validates: Requirements 4.1, 4.2**
    - File: `src/api/connections/logic.property.test.ts`

  - [x] 3.11 Write property test: Audit entry construction (Property 7)
    - **Property 7: Audit entry construction**
    - **Validates: Requirements 5.4, 6.5**
    - File: `src/api/connections/logic.property.test.ts`

  - [x] 3.12 Write property test: Published dependency guard (Property 8)
    - **Property 8: Published dependency guard**
    - **Validates: Requirements 6.1, 6.2**
    - File: `src/api/connections/logic.property.test.ts`

  - [x] 3.13 Write property test: Soft-delete state transition (Property 9)
    - **Property 9: Soft-delete state transition**
    - **Validates: Requirements 6.4**
    - File: `src/api/connections/logic.property.test.ts`

- [x] 4. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement repository and secrets service interfaces
  - [x] 5.1 Create `ConnectionRepository` and `AuditRepository` interfaces in `src/api/connections/handlers.ts`
    - Define `ConnectionRepository` with `create`, `getById`, `listByTenant`, `update`, `softDelete` methods
    - Define `AuditRepository` with `writeEntry` method
    - Define `SecretsService` with `createSecret`, `getSecretValue`, `putSecretValue`, `scheduleDelete` methods
    - Follow the existing `TemplateRepository` pattern from `src/api/templates/handlers.ts`
    - _Requirements: 1.2, 1.3, 5.3, 6.3, 6.4_

- [x] 6. Implement API route handlers
  - [x] 6.1 Implement `createConnectionHandler` in `src/api/connections/handlers.ts`
    - Factory function accepting `(repo, secrets, registry)`
    - Validates credentials via `validateCredentials`, creates secret, creates DynamoDB record
    - Returns 201 with `connectionId`, `status`; returns 400 on validation failure
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 6.2 Implement `testConnectionHandler` in `src/api/connections/handlers.ts`
    - Factory function accepting `(repo, secrets, registry)`
    - Retrieves connection, fetches secret, invokes `testFn`, updates status
    - Returns `{ success, message }`; returns 404 if connection not found
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 6.3 Implement `listConnectionsHandler` in `src/api/connections/handlers.ts`
    - Factory function accepting `(repo)`
    - Lists connections by tenant, maps each through `mapConnectionToListItem`
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 6.4 Implement `getDependenciesHandler` in `src/api/connections/handlers.ts`
    - Factory function accepting `(repo, workflowRepo)`
    - Retrieves connection, queries workflows, filters dependents
    - Returns 404 if connection not found; returns empty list if no dependents
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 6.5 Implement `rotateConnectionHandler` in `src/api/connections/handlers.ts`
    - Factory function accepting `(repo, secrets, registry, audit)`
    - Validates new credentials, tests via `testFn`, updates secret and record, writes audit entry
    - Returns 422 if test fails; returns `{ success: true }` on success
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 6.6 Implement `deleteConnectionHandler` in `src/api/connections/handlers.ts`
    - Factory function accepting `(repo, secrets, workflowRepo, audit)`
    - Checks published dependents, schedules secret deletion (7-day recovery), soft-deletes record, writes audit entry
    - Returns 409 if published dependents exist; returns 204 on success
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 6.7 Write unit tests for all handlers in `src/api/connections/handlers.test.ts`
    - Test create: 201 on success, 400 on bad input, 400 on unknown connector
    - Test test-connection: 200 on success, 404 on missing connection
    - Test list: 200 with mapped items
    - Test dependencies: 200 with dependents, 200 with empty list, 404 on missing connection
    - Test rotate: 200 on success, 422 on failed test, 404 on missing connection
    - Test delete: 204 on success, 409 on published dependents, 404 on missing connection
    - Mock `ConnectionRepository`, `SecretsService`, `AuditRepository`, and registry
    - _Requirements: 1.1–1.6, 2.1–2.5, 3.1–3.3, 4.1–4.3, 5.1–5.6, 6.1–6.6_

- [x] 7. Create barrel export and wire modules
  - [x] 7.1 Create `src/api/connections/index.ts` barrel export
    - Re-export handler factories from `handlers.ts`, logic functions from `logic.ts`, and registry from `registry.ts`
    - Follow the existing pattern in `src/api/templates/index.ts`
    - _Requirements: all_

  - [x] 7.2 Write unit tests for pure logic functions in `src/api/connections/logic.test.ts`
    - Test `validateCredentials` edge cases: empty object, extra fields, missing required fields, wrong types, unknown connector key
    - Test `mapConnectionToListItem` with specific records
    - Test `filterDependentWorkflows` with empty list, no matches, all matches
    - Test `hasPublishedDependents` with zero dependents, all draft, one published
    - Test `buildAuditEntry` with specific inputs
    - Test `buildNewConnectionRecord` produces correct initial state
    - Test `buildSecretName` with specific tenant/connection IDs
    - _Requirements: 1.1, 1.5, 1.6, 2.2, 4.1, 5.4, 6.1, 6.4_

- [x] 8. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All code follows existing patterns: pure logic in `logic.ts`, handler factories in `handlers.ts`, repository interfaces in handlers file
