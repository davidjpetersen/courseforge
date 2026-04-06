# Requirements Document

## Introduction

This specification covers the Education Standards connectors for CourseForge Connect: the OneRoster Roster Sync connector (S09) and the LTI 1.3 Tool Provisioning step (S19). Both connectors are TypeScript modules in `/packages/connectors/` invoked as Step Functions tasks via `ExecuteStepFn`. No new Lambda or CDK infrastructure is required. The requirements document the correctness properties of the existing implementation.

## Glossary

- **OneRoster_Connector**: The connector module at `/packages/connectors/oneroster/` that synchronizes roster data from a OneRoster v1.1-compliant SIS endpoint into CourseForge.
- **LTI_Provision_Connector**: The connector module at `/packages/connectors/lti-provision/` that provisions LTI 1.3 tool placements on Canvas, Blackboard, or Brightspace LMS instances.
- **Connector_Registry**: The module at `/packages/connectors/registry.ts` that maps connector keys to their implementations and resolves them at runtime.
- **ConnectorDefinition**: The standard interface every connector exports, containing key, displayName, authType, credentialSchema, testFn, and run.
- **FieldMapping**: A pair of sourceField and targetField strings used by the OneRoster_Connector to transform records.
- **BatchSyncThresholdError**: An error thrown by the OneRoster_Connector when the ratio of errored records to total records exceeds 20%.
- **LtiError**: A normalized error structure with lmsErrorCode, message, and optional field, used to unify error responses from Canvas, Blackboard, and Brightspace.
- **SyncScope**: A parameter value of either 'delta' or 'full' that controls whether the OneRoster_Connector fetches only records modified since the last sync or all records.
- **ExecuteStepFn**: The Step Functions task handler that invokes connectors by key from the Connector_Registry.

---

## Requirements

### Requirement 1: OneRoster Connector Definition

**User Story:** As a platform operator, I want the OneRoster connector to expose a standard ConnectorDefinition, so that the Connector_Registry can discover and invoke it uniformly.

#### Acceptance Criteria

1. THE OneRoster_Connector SHALL export a ConnectorDefinition with key 'oneroster', displayName 'OneRoster Roster Sync', and authType 'oauth2'.
2. THE OneRoster_Connector SHALL declare a credentialSchema requiring baseUrl, clientId, and clientSecret as string properties with no additional properties allowed.
3. WHEN the testFn is called with valid credentials, THE OneRoster_Connector SHALL perform a GET request to `{baseUrl}/ims/oneroster/v1p1/schools` and return true when the response status is 200.
4. IF the testFn encounters a network error or non-200 response, THEN THE OneRoster_Connector SHALL return false.

---

### Requirement 2: OneRoster OAuth2 Token Management

**User Story:** As a platform operator, I want the OneRoster connector to manage OAuth2 tokens with caching, so that redundant token requests are avoided during a sync run.

#### Acceptance Criteria

1. WHEN the OneRoster_Connector needs an access token, THE OneRoster_Connector SHALL POST client credentials to `{baseUrl}/ims/oneroster/v1p1/token` using grant_type 'client_credentials'.
2. WHEN a valid token is returned, THE OneRoster_Connector SHALL cache the token in memory keyed by `{baseUrl}::{clientId}`.
3. WHEN a cached token exists for the same baseUrl and clientId, THE OneRoster_Connector SHALL return the cached token without making a network request.
4. IF the token endpoint returns a non-200 response, THEN THE OneRoster_Connector SHALL throw an error containing the HTTP status code.
5. IF the token response is missing the access_token field, THEN THE OneRoster_Connector SHALL throw an error indicating the missing field.

---

### Requirement 3: OneRoster Enrollment Fetching with Pagination and Delta Filter

**User Story:** As a platform operator, I want the OneRoster connector to fetch enrollments with pagination and optional delta filtering, so that large districts can sync incrementally.

#### Acceptance Criteria

1. WHEN syncScope is 'delta' and lastSyncedAt is provided, THE OneRoster_Connector SHALL append a query parameter `filter=dateLastModified>'{lastSyncedAt}'` to the enrollments endpoint URL.
2. WHEN syncScope is 'full', THE OneRoster_Connector SHALL fetch enrollments without a date filter.
3. WHILE the response contains a Link header with a rel="next" URL, THE OneRoster_Connector SHALL follow the next URL to fetch additional pages of enrollments.
4. WHEN a targetOrgId is provided, THE OneRoster_Connector SHALL filter enrollments to include only records where schoolSourcedId matches the targetOrgId.
5. IF the enrollments endpoint returns a non-200 response, THEN THE OneRoster_Connector SHALL throw an error containing the HTTP status code.

---

### Requirement 4: OneRoster User Fetching with Batching

**User Story:** As a platform operator, I want the OneRoster connector to fetch users in batches of 50, so that API rate limits are respected.

#### Acceptance Criteria

1. THE OneRoster_Connector SHALL deduplicate user IDs before fetching.
2. THE OneRoster_Connector SHALL split user IDs into batches of at most 50 per request.
3. WHEN fetching a batch of users, THE OneRoster_Connector SHALL use a filter query `sourcedId in ('id1','id2',...)` against the `/ims/oneroster/v1p1/users` endpoint.
4. IF a user batch request returns a non-200 response, THEN THE OneRoster_Connector SHALL record an error with errorCode 'USER_FETCH_FAILED' for each enrollment in the current sync set.

---

### Requirement 5: OneRoster Field Mapping

**User Story:** As a workflow author, I want to define field mappings that transform OneRoster records into a target schema, so that downstream steps receive data in the expected format.

#### Acceptance Criteria

1. WHEN a FieldMapping specifies a sourceField that exists on the record, THE OneRoster_Connector SHALL copy the value to the corresponding targetField in the output.
2. WHEN a FieldMapping specifies a sourceField that does not exist on the record, THE OneRoster_Connector SHALL skip that mapping without error.
3. THE OneRoster_Connector SHALL exclude record fields that are not referenced by any FieldMapping from the output.
4. FOR ALL records and FieldMapping arrays, applying applyFieldMappings SHALL produce an output containing only the targetField keys from mappings whose sourceField exists on the input record (round-trip correctness property).

---

### Requirement 6: OneRoster Sync Output to S3

**User Story:** As a platform operator, I want the OneRoster connector to write sync results to S3, so that downstream steps and auditing can access the output.

#### Acceptance Criteria

1. THE OneRoster_Connector SHALL write mapped records as JSON to `s3://courseforge-artifacts/{tenantId}/oneroster-sync/{runId}/output.json`.
2. THE OneRoster_Connector SHALL set the S3 object content type to 'application/json'.
3. IF the s3Client is not provided in the ConnectorContext, THEN THE OneRoster_Connector SHALL throw an error indicating the missing s3Client.

---

### Requirement 7: OneRoster Error Threshold and Metrics

**User Story:** As a platform operator, I want the OneRoster connector to abort when too many records fail and emit CloudWatch metrics, so that bad syncs are caught early and monitored.

#### Acceptance Criteria

1. WHEN the ratio of errored records to total enrollment records exceeds 0.2, THE OneRoster_Connector SHALL throw a BatchSyncThresholdError containing the error rate and total count.
2. WHEN the ratio of errored records to total enrollment records is 0.2 or less, THE OneRoster_Connector SHALL return a successful OneRosterResult.
3. WHEN there are zero enrollment records, THE OneRoster_Connector SHALL treat the error rate as 0 and return a successful result.
4. THE OneRoster_Connector SHALL emit a CloudWatch metric named 'OneRosterSyncErrors' in the 'courseforge' namespace with the count of errors.
5. THE OneRoster_Connector SHALL emit a CloudWatch metric named 'OneRosterSynced' in the 'courseforge' namespace with the count of synced records.

---

### Requirement 8: LTI Provision Connector Definition

**User Story:** As a platform operator, I want the LTI Provision connector to expose a standard ConnectorDefinition, so that the Connector_Registry can discover and invoke it uniformly.

#### Acceptance Criteria

1. THE LTI_Provision_Connector SHALL export a ConnectorDefinition with key 'lti-provision', displayName 'LTI 1.3 Tool Provisioning', and authType 'apikey'.
2. THE LTI_Provision_Connector SHALL declare a credentialSchema requiring lmsType (enum: canvas, blackboard, brightspace), baseUrl, and apiKey as string properties with no additional properties allowed.
3. WHEN the testFn is called with lmsType 'canvas', THE LTI_Provision_Connector SHALL perform a GET request to `{baseUrl}/api/v1/accounts` and return true when the response status is 200.
4. WHEN the testFn is called with lmsType 'blackboard', THE LTI_Provision_Connector SHALL perform a GET request to `{baseUrl}/learn/api/public/v1/system/version` and return true when the response status is 200.
5. WHEN the testFn is called with lmsType 'brightspace', THE LTI_Provision_Connector SHALL perform a GET request to `{baseUrl}/d2l/api/versions/` and return true when the response status is 200.
6. IF the testFn is called with an unsupported lmsType, THEN THE LTI_Provision_Connector SHALL return false.

---

### Requirement 9: LTI Canvas Provisioning

**User Story:** As a course administrator, I want the LTI connector to provision an external tool on Canvas, so that learners can launch CourseForge from within Canvas.

#### Acceptance Criteria

1. WHEN lmsType is 'canvas', THE LTI_Provision_Connector SHALL POST to `{baseUrl}/api/v1/courses/{courseId}/external_tools` with the tool name, launch URL, consumer key, and shared secret.
2. WHEN Canvas returns HTTP 200, THE LTI_Provision_Connector SHALL return a LtiProvisionResult with success true and the lmsToolId from the response payload.
3. WHEN Canvas returns HTTP 422, THE LTI_Provision_Connector SHALL return a LtiProvisionResult with success false and a message containing the normalized validation error.
4. IF Canvas returns any other non-200 status, THEN THE LTI_Provision_Connector SHALL throw an error with the normalized LtiError code and message.

---

### Requirement 10: LTI Blackboard Provisioning

**User Story:** As a course administrator, I want the LTI connector to create a placement on Blackboard, so that learners can launch CourseForge from within Blackboard.

#### Acceptance Criteria

1. WHEN lmsType is 'blackboard', THE LTI_Provision_Connector SHALL POST to `{baseUrl}/learn/api/public/v1/lti/placements` with the tool name, description, launch link, and custom parameters.
2. WHEN Blackboard returns a successful response, THE LTI_Provision_Connector SHALL return a LtiProvisionResult with success true and the lmsToolId from the response payload.
3. IF Blackboard returns a non-200 response, THEN THE LTI_Provision_Connector SHALL throw an error with the normalized LtiError containing the Blackboard error code and message.

---

### Requirement 11: LTI Brightspace Provisioning

**User Story:** As a course administrator, I want the LTI connector to create an LTI link on Brightspace, so that learners can launch CourseForge from within Brightspace.

#### Acceptance Criteria

1. WHEN lmsType is 'brightspace', THE LTI_Provision_Connector SHALL POST to `{baseUrl}/d2l/api/lp/{version}/lti/link/{courseId}` with D2L authentication signature query parameters.
2. THE LTI_Provision_Connector SHALL compute the D2L signature as a base64url encoding of `{apiKey}:{toolClientId}:{path}`.
3. WHEN Brightspace returns a successful response, THE LTI_Provision_Connector SHALL return a LtiProvisionResult with success true and the lmsToolId from the LinkId in the response payload.
4. IF Brightspace returns a non-200 response, THEN THE LTI_Provision_Connector SHALL throw an error with the normalized LtiError containing the Brightspace ErrorCode and Message.

---

### Requirement 12: LTI Error Normalization

**User Story:** As a platform operator, I want all LMS-specific errors normalized into a common LtiError structure, so that error handling is consistent regardless of LMS type.

#### Acceptance Criteria

1. WHEN Canvas returns an error response, THE LTI_Provision_Connector SHALL normalize the error into an LtiError with lmsErrorCode set to the HTTP status and message extracted from the errors array.
2. WHEN Blackboard returns an error response, THE LTI_Provision_Connector SHALL normalize the error into an LtiError with lmsErrorCode from the response code field and message from the response message field.
3. WHEN Brightspace returns an error response, THE LTI_Provision_Connector SHALL normalize the error into an LtiError with lmsErrorCode from the ErrorCode field and message from the Message field.
4. IF the error response body cannot be parsed as JSON, THEN THE LTI_Provision_Connector SHALL use the HTTP status as lmsErrorCode and a default message for the LMS type.

---

### Requirement 13: Connector Registry Integration

**User Story:** As a platform operator, I want both connectors registered in the Connector_Registry, so that the ExecuteStepFn can resolve and invoke them by key.

#### Acceptance Criteria

1. THE Connector_Registry SHALL contain an entry with key 'oneroster' that resolves to the OneRoster_Connector.
2. THE Connector_Registry SHALL contain an entry with key 'lti-provision' that resolves to the LTI_Provision_Connector.
3. WHEN resolveConnector is called with an unknown key, THE Connector_Registry SHALL throw an error containing the unknown key.
