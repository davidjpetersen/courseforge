# Requirements Document

## Introduction

Connection Management is the credential lifecycle feature for CourseForge Connect. It enables tenants to securely create, test, rotate, and delete integration credentials for external systems (LMS platforms, notification services, generic HTTP endpoints). Credentials are stored in AWS Secrets Manager, and connection metadata lives in the existing DynamoDB single-table alongside workflow and template records. The feature covers stories S03 (create a secure connection), S04 (test before saving), S11 (view dependency map), and S12 (rotate or delete credentials).

The stack is Next.js App Router (frontend + API routes), AWS SDK v3 (Secrets Manager and DynamoDB). The DynamoDB table (`courseforge-main`) and Secrets Manager IAM role from the foundation infrastructure stack are assumed to be in place. OAuth 2.0 redirect flow is out of scope for this iteration; OAuth connectors display a stub "Connect via OAuth" button with a "Not yet implemented" toast.

## Glossary

- **Connection**: A record representing a set of stored credentials linking a Tenant to an external system via a specific Connector. Stored in DynamoDB with PK `TENANT#{tenantId}`, SK `CONNECTION#{connectionId}`.
- **Connector**: A supported external system integration (e.g., Canvas LMS, Blackboard, Brightspace, Slack, SMTP Email, Generic HTTP).
- **Connector_Registry**: A local TypeScript module at `/app/lib/connectors/registry.ts` that exports a `ConnectorDefinition` for each supported Connector, including its credential schema and test function.
- **ConnectorDefinition**: An object containing `key`, `displayName`, `authType`, `credentialSchema` (JSON Schema 7), and `testFn` for a given Connector.
- **Credential**: Authentication data (access token, refresh token, API key, username/password) required to communicate with an external system. Stored as a JSON secret in Secrets Manager.
- **Secret_Ref**: The AWS Secrets Manager ARN referencing the stored Credential for a Connection.
- **Auth_Type**: The authentication method used by a Connection: `oauth2`, `apikey`, or `basic`.
- **Connection_Status**: The lifecycle state of a Connection: `active`, `error`, `pending`, or `deleted`.
- **Dependency**: A Workflow record that references a given Connection by `connectionId`.
- **Audit_Log_Entry**: A DynamoDB record (PK `TENANT#{tenantId}`, SK `AUDIT#{timestamp}#{uuid}`) capturing a security-relevant action performed on a Connection.
- **Tenant**: An isolated organizational account within CourseForge Connect.
- **Workflow**: A configured and published automation instance that may reference one or more Connections.
- **Connection_Card**: A UI component displaying a Connection's connector icon, display name, auth type, status badge, and last tested date.
- **Add_Connection_Modal**: A multi-step modal for creating a new Connection (select connector, enter credentials, test, save).
- **Rotate_Credential_Modal**: A modal for supplying and validating new credentials for an existing Connection.

## Requirements

### Requirement 1: Create a Secure Connection

**User Story:** As an LMS Admin, I want to create a new connection by selecting a connector and providing credentials, so that CourseForge Connect can securely integrate with my external system.

#### Acceptance Criteria

1. WHEN the LMS_Admin submits a create-connection request with a valid `connectorKey`, `displayName`, `authType`, and `credentials` object, THE Connection_Management API SHALL validate the credentials shape against the Connector_Registry's `credentialSchema` for the specified `connectorKey`.
2. WHEN credential validation passes, THE Connection_Management API SHALL write the credentials as a JSON secret to Secrets Manager using the naming convention `courseforge/tenant/{tenantId}/connection/{connectionId}`.
3. WHEN the secret is written successfully, THE Connection_Management API SHALL create a Connection record in DynamoDB with status `pending`, storing the Secret_Ref, and return `connectionId`, `status`, and `secretRef` in the response.
4. THE Connection_Management API SHALL generate a unique `connectionId` (UUID) for each new Connection.
5. IF the credentials object does not match the `credentialSchema` for the specified `connectorKey`, THEN THE Connection_Management API SHALL return a 400 response with a structured error containing `field` and `message` properties.
6. THE Connection_Management API SHALL exclude raw credential values from all API responses.

### Requirement 2: Test Connection Credentials

**User Story:** As an LMS Admin, I want to test my connection credentials before relying on them, so that I can verify the integration works correctly.

#### Acceptance Criteria

1. WHEN the LMS_Admin triggers a test for a given `connectionId`, THE Connection_Management API SHALL retrieve the Secret_Ref from the Connection record in DynamoDB and invoke the Connector_Registry's `testFn` for the corresponding Connector.
2. WHEN the `testFn` returns a successful result, THE Connection_Management API SHALL update the Connection record status to `active` and return `{ success: true, message }`.
3. WHEN the `testFn` returns a failure result, THE Connection_Management API SHALL update the Connection record status to `error` and return `{ success: false, message }`.
4. THE Connection_Management API test endpoint SHALL be idempotent: repeated calls with the same `connectionId` SHALL produce the same status outcome given the same external system state.
5. THE Connection_Management API SHALL exclude secret values from the test response.

### Requirement 3: List Tenant Connections

**User Story:** As an LMS Admin, I want to view all connections for my organization, so that I can manage and monitor integration health at a glance.

#### Acceptance Criteria

1. WHEN the LMS_Admin requests the connections list, THE Connection_Management API SHALL return all Connection records for the authenticated Tenant by querying DynamoDB with PK `TENANT#{tenantId}`.
2. FOR EACH Connection in the response, THE Connection_Management API SHALL return only `connectionId`, `displayName`, `connectorKey`, `authType`, `status`, `createdAt`, and `lastTestedAt`.
3. THE Connection_Management API SHALL exclude Secret_Ref and raw credential values from the list response.

### Requirement 4: View Connection Dependencies

**User Story:** As an LMS Admin, I want to see which workflows depend on a connection, so that I can understand the impact before rotating or deleting credentials.

#### Acceptance Criteria

1. WHEN the LMS_Admin requests dependencies for a given `connectionId`, THE Connection_Management API SHALL query DynamoDB for all Workflow records referencing that `connectionId`.
2. THE Connection_Management API SHALL return a list of dependent workflows containing `workflowId`, `name`, and `status` for each.
3. WHEN no workflows reference the given `connectionId`, THE Connection_Management API SHALL return an empty workflows list.

### Requirement 5: Rotate Connection Credentials

**User Story:** As an LMS Admin, I want to rotate credentials for an existing connection, so that I can maintain security without disrupting active workflows.

#### Acceptance Criteria

1. WHEN the LMS_Admin submits new credentials for an existing `connectionId`, THE Connection_Management API SHALL validate the new credentials shape against the Connector_Registry's `credentialSchema`.
2. WHEN credential validation passes, THE Connection_Management API SHALL test the new credentials using the Connector_Registry's `testFn` before updating the stored secret.
3. WHEN the test passes, THE Connection_Management API SHALL atomically update the secret value in Secrets Manager using `PutSecretValue` and update the Connection record's `status` and `updatedAt` in DynamoDB.
4. WHEN the rotation succeeds, THE Connection_Management API SHALL write an Audit_Log_Entry to DynamoDB with `actionType` set to `CONNECTION_ROTATED`, including `actor`, `resourceId` (connectionId), `ip`, and `timestamp`.
5. IF the new credentials fail the `testFn`, THEN THE Connection_Management API SHALL return a 422 response with `{ message: 'New credentials failed validation', detail }` and leave the existing secret unchanged.
6. THE Connection_Management API SHALL return `{ success: true }` on successful rotation.

### Requirement 6: Delete a Connection

**User Story:** As an LMS Admin, I want to delete a connection that is no longer needed, so that stale credentials are removed and security posture is maintained.

#### Acceptance Criteria

1. WHEN the LMS_Admin requests deletion of a `connectionId`, THE Connection_Management API SHALL check for dependent Workflow records with status `PUBLISHED`.
2. IF any Workflow with status `PUBLISHED` references the Connection, THEN THE Connection_Management API SHALL reject the deletion with a 409 response.
3. WHEN no published workflows depend on the Connection, THE Connection_Management API SHALL delete the Secrets Manager secret with a recovery window of 7 days (not force-delete).
4. WHEN the secret deletion is initiated, THE Connection_Management API SHALL soft-delete the DynamoDB Connection record by setting `status` to `deleted` and recording `deletedAt`.
5. WHEN the deletion succeeds, THE Connection_Management API SHALL write an Audit_Log_Entry to DynamoDB with `actionType` set to `CONNECTION_DELETED`.
6. THE Connection_Management API SHALL return a 204 response on successful deletion.

### Requirement 7: Connector Registry

**User Story:** As a developer, I want a centralized connector registry that defines supported integrations, so that credential validation and connection testing are consistent across all connectors.

#### Acceptance Criteria

1. THE Connector_Registry SHALL export a `ConnectorDefinition` for each supported Connector: `canvas-lms`, `blackboard`, `brightspace`, `slack`, `smtp-email`, and `generic-http`.
2. FOR EACH ConnectorDefinition, THE Connector_Registry SHALL include a `key`, `displayName`, `authType`, `credentialSchema` (JSON Schema 7), and a `testFn`.
3. WHEN `testFn` is invoked for `canvas-lms`, THE Connector_Registry SHALL execute a read-only GET request to `/api/v1/accounts` on the configured Canvas instance.
4. WHEN `testFn` is invoked for `blackboard`, THE Connector_Registry SHALL execute a read-only GET request to `/learn/api/public/v1/system/version` on the configured Blackboard instance.
5. WHEN `testFn` is invoked for `generic-http`, THE Connector_Registry SHALL execute a GET request to the configured base URL.
6. FOR ALL connectors with `authType` set to `oauth2`, THE Connector_Registry SHALL define a stub `testFn` that returns a "Not yet implemented" message.

