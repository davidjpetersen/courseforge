# Requirements Document

## Introduction

The Developer REST API provides a public, documented, and rate-limited programmatic interface for CourseForge Connect. EdTech product builders use this API to manage workflows, trigger events, and query run status from their own applications. The API is authenticated via API keys, enforces per-tenant rate limiting, and is fully documented with an OpenAPI 3.1 specification served through an embedded Swagger UI developer portal.

## Glossary

- **API_Gateway**: The Next.js API route layer that receives and routes incoming HTTP requests to the appropriate handler.
- **API_Key_Manager**: The subsystem responsible for creating, listing, and revoking API keys for a tenant.
- **API_Key_Auth_Middleware**: The middleware that extracts a Bearer token from the Authorization header, hashes it with SHA-256, looks it up via a DynamoDB GSI, and attaches tenant context to the request.
- **Rate_Limiter**: The middleware that enforces per-tenant, per-endpoint-group request rate limits using a token bucket algorithm backed by DynamoDB.
- **Workflow_API**: The set of public API routes under `/api/v1/` that expose workflow CRUD and publishing operations.
- **Run_API**: The set of public API routes under `/api/v1/` that expose run querying operations.
- **Event_API**: The public API route that accepts event payloads to trigger workflow runs.
- **Recipe_API**: The public API route that returns the catalog of available workflow recipes.
- **OpenAPI_Spec_Generator**: The module that produces a complete OpenAPI 3.1 JSON specification describing all public API routes.
- **Developer_Portal**: The UI page that provides API key management, usage statistics, and a link to the interactive API documentation.
- **Swagger_UI_Page**: The page that renders the OpenAPI specification using Swagger UI loaded from CDN.
- **Token_Bucket**: A rate limiting data structure where tokens are consumed per request and refilled over time at a fixed rate.
- **Endpoint_Group**: A classification of API routes into `read` (GET), `write` (POST/PUT/DELETE), or `events` (POST /events) for rate limiting purposes.
- **ApiKey_Record**: A DynamoDB item with PK `TENANT#{tenantId}`, SK `APIKEY#{keyId}` storing key metadata and the SHA-256 hash of the raw key.
- **Rate_Limit_Bucket**: A DynamoDB item with key `RATELIMIT#{tenantId}#{endpoint_group}` storing current token count and last refill timestamp.
- **Tenant**: An organization or account that owns workflows, runs, and API keys within CourseForge Connect.
- **Scope**: The permission level of an API key, either `read` (GET operations) or `write` (all operations including mutations).

## Requirements

### Requirement 1: API Key Creation

**User Story:** As an EdTech developer, I want to create API keys with a specified name and scope, so that I can authenticate programmatic access to the CourseForge Connect API.

#### Acceptance Criteria

1. WHEN a POST request is received at `/api/developer/keys` with a valid JSON body containing `name` (string) and `scope` (`read` or `write`), THE API_Key_Manager SHALL generate a cryptographically random 32-byte key, format the raw key as `cfk_live_{base64url}`, store only the SHA-256 hash in DynamoDB as an ApiKey_Record, and return a JSON response containing `keyId`, `key` (the raw key), `scope`, and `name`.
2. WHEN a POST request is received at `/api/developer/keys` with a missing or invalid `name` or `scope` field, THE API_Key_Manager SHALL return a 400 status code with a descriptive error message.
3. THE API_Key_Manager SHALL store each ApiKey_Record with fields `keyId`, `tenantId`, `name`, `hashedKey`, `scope`, `createdBy`, `createdAt`, `lastUsedAt`, and `enabled` set to `true`.
4. THE API_Key_Manager SHALL return the raw key value only in the creation response and SHALL NOT store or return the raw key in any subsequent request.

### Requirement 2: API Key Listing

**User Story:** As an EdTech developer, I want to list all API keys for my tenant, so that I can review which keys exist and their status.

#### Acceptance Criteria

1. WHEN a GET request is received at `/api/developer/keys`, THE API_Key_Manager SHALL return a JSON array of all ApiKey_Records for the authenticated tenant, including `keyId`, `name`, `scope`, `createdBy`, `createdAt`, `lastUsedAt`, and `enabled` fields.
2. THE API_Key_Manager SHALL NOT include the `hashedKey` or raw key value in the listing response.

### Requirement 3: API Key Revocation

**User Story:** As an EdTech developer, I want to revoke an API key, so that I can disable compromised or unused keys without permanently deleting the record.

#### Acceptance Criteria

1. WHEN a DELETE request is received at `/api/developer/keys/:keyId`, THE API_Key_Manager SHALL set the `enabled` field to `false` and record a `deletedAt` timestamp on the matching ApiKey_Record.
2. WHEN a DELETE request is received at `/api/developer/keys/:keyId` with a `keyId` that does not belong to the authenticated tenant, THE API_Key_Manager SHALL return a 404 status code.

### Requirement 4: API Key Authentication Middleware

**User Story:** As the system, I want to authenticate incoming API requests using Bearer tokens, so that only valid API key holders can access the public API.

#### Acceptance Criteria

1. WHEN an HTTP request includes an `Authorization: Bearer {token}` header, THE API_Key_Auth_Middleware SHALL compute the SHA-256 hash of the token and look up the corresponding ApiKey_Record using a DynamoDB GSI on `hashedKey`.
2. WHEN the hashed token matches an enabled ApiKey_Record, THE API_Key_Auth_Middleware SHALL attach the `tenantId` and `scope` from the record to the request context and allow the request to proceed.
3. WHEN the hashed token does not match any ApiKey_Record or the matching record has `enabled` set to `false`, THE API_Key_Auth_Middleware SHALL return a 401 status code with the body `{ "error": "Invalid or revoked API key" }`.
4. WHEN a request is successfully authenticated, THE API_Key_Auth_Middleware SHALL update the `lastUsedAt` field on the ApiKey_Record asynchronously without blocking the response.
5. WHEN an HTTP request does not include an `Authorization` header, THE API_Key_Auth_Middleware SHALL return a 401 status code with the body `{ "error": "Invalid or revoked API key" }`.

### Requirement 5: Rate Limiting

**User Story:** As a platform operator, I want to enforce per-tenant rate limits on the public API, so that no single tenant can overwhelm the system.

#### Acceptance Criteria

1. THE Rate_Limiter SHALL use a Token_Bucket algorithm backed by DynamoDB with a bucket key of `RATELIMIT#{tenantId}#{endpoint_group}`.
2. THE Rate_Limiter SHALL classify requests into Endpoint_Groups: `read` for GET routes, `write` for POST, PUT, and DELETE routes, and `events` for POST `/api/v1/events`.
3. THE Rate_Limiter SHALL default to a capacity of 100 requests per 60-second window per Endpoint_Group per Tenant.
4. WHEN a request is received, THE Rate_Limiter SHALL retrieve the current token count and `lastRefillAt` timestamp, calculate elapsed time, refill tokens proportionally, and deduct one token if available.
5. WHEN the Token_Bucket has zero remaining tokens, THE Rate_Limiter SHALL return a 429 status code with the body `{ "error": "Rate limit exceeded", "retryAfter": <seconds> }` and a `Retry-After` HTTP header set to the number of seconds until the next token refill.
6. THE Rate_Limiter SHALL use DynamoDB conditional writes with optimistic locking to prevent race conditions during concurrent token updates.

### Requirement 6: Recipe Listing API

**User Story:** As an EdTech developer, I want to list available workflow recipes via the API, so that I can discover templates for building workflows programmatically.

#### Acceptance Criteria

1. WHEN a GET request is received at `/api/v1/recipes`, THE Recipe_API SHALL return a JSON array of recipe objects containing `id`, `name`, `description`, `category`, `standards`, and `estimatedMinutes` fields.
2. THE Recipe_API SHALL allow access with either `read` or `write` scope API keys.

### Requirement 7: Workflow Creation via API

**User Story:** As an EdTech developer, I want to create workflows via the API, so that I can programmatically set up automation pipelines.

#### Acceptance Criteria

1. WHEN a POST request is received at `/api/v1/workflows` with a valid JSON body containing `name`, `recipeId`, `params`, `environmentId`, and `connectionIds`, THE Workflow_API SHALL create a new workflow and return a JSON response containing `workflowId`, `versionId`, and `status`.
2. WHEN a POST request is received at `/api/v1/workflows` with missing or invalid fields, THE Workflow_API SHALL return a 400 status code with a descriptive error message.
3. THE Workflow_API SHALL require an API key with `write` scope for workflow creation.

### Requirement 8: Workflow Listing via API

**User Story:** As an EdTech developer, I want to list workflows for my tenant via the API, so that I can query the state of my automation pipelines.

#### Acceptance Criteria

1. WHEN a GET request is received at `/api/v1/workflows`, THE Workflow_API SHALL return a JSON array of workflows belonging to the authenticated tenant.
2. WHEN the query parameter `status` is provided, THE Workflow_API SHALL filter the results to workflows matching the specified status.
3. WHEN the query parameter `environmentId` is provided, THE Workflow_API SHALL filter the results to workflows matching the specified environment.
4. THE Workflow_API SHALL allow access with either `read` or `write` scope API keys.

### Requirement 9: Workflow Detail via API

**User Story:** As an EdTech developer, I want to retrieve the details of a specific workflow via the API, so that I can inspect its configuration and status.

#### Acceptance Criteria

1. WHEN a GET request is received at `/api/v1/workflows/:workflowId`, THE Workflow_API SHALL return the workflow detail for the specified workflow belonging to the authenticated tenant.
2. THE Workflow_API SHALL NOT include compiled plan secrets in the workflow detail response.
3. WHEN the specified `workflowId` does not exist or does not belong to the authenticated tenant, THE Workflow_API SHALL return a 404 status code.
4. THE Workflow_API SHALL allow access with either `read` or `write` scope API keys.

### Requirement 10: Workflow Publishing via API

**User Story:** As an EdTech developer, I want to publish a workflow via the API, so that I can activate automation pipelines programmatically.

#### Acceptance Criteria

1. WHEN a POST request is received at `/api/v1/workflows/:workflowId/publish`, THE Workflow_API SHALL delegate to the existing publish logic and return the updated workflow status.
2. WHEN the specified `workflowId` does not exist or does not belong to the authenticated tenant, THE Workflow_API SHALL return a 404 status code.
3. THE Workflow_API SHALL require an API key with `write` scope for publishing.

### Requirement 11: Event Triggering via API

**User Story:** As an EdTech developer, I want to trigger workflow events via the API, so that I can initiate workflow runs from my own applications.

#### Acceptance Criteria

1. WHEN a POST request is received at `/api/v1/events` with a valid JSON body containing `workflowId` (string) and `payload` (object), THE Event_API SHALL validate that the `workflowId` belongs to the authenticated tenant and the workflow status is PUBLISHED.
2. WHEN validation succeeds, THE Event_API SHALL publish a DomainEvent to EventBridge, create a Run record in DynamoDB, and return a JSON response containing `runId` and `traceId`.
3. WHEN the `workflowId` does not belong to the authenticated tenant or the workflow is not PUBLISHED, THE Event_API SHALL return a 409 status code with a descriptive error message.
4. WHEN the request body is missing `workflowId` or `payload`, THE Event_API SHALL return a 400 status code with a descriptive error message.
5. THE Event_API SHALL require an API key with `write` scope.

### Requirement 12: Run Listing via API

**User Story:** As an EdTech developer, I want to list workflow runs via the API, so that I can monitor execution history programmatically.

#### Acceptance Criteria

1. WHEN a GET request is received at `/api/v1/runs`, THE Run_API SHALL return a JSON array of run records for the authenticated tenant.
2. WHEN the query parameter `workflowId` is provided, THE Run_API SHALL filter results to runs for the specified workflow.
3. WHEN the query parameter `status` is provided, THE Run_API SHALL filter results to runs matching the specified status.
4. THE Run_API SHALL support a `limit` query parameter with a default value of 50 and a `cursor` query parameter for pagination.
5. THE Run_API SHALL NOT include sensitive payload data in the run listing response.
6. THE Run_API SHALL allow access with either `read` or `write` scope API keys.

### Requirement 13: Run Detail via API

**User Story:** As an EdTech developer, I want to retrieve the details of a specific run via the API, so that I can inspect execution results and step summaries.

#### Acceptance Criteria

1. WHEN a GET request is received at `/api/v1/runs/:runId`, THE Run_API SHALL return the run detail including a step summary for the specified run belonging to the authenticated tenant.
2. THE Run_API SHALL NOT include raw payloads in the run detail response.
3. WHEN the specified `runId` does not exist or does not belong to the authenticated tenant, THE Run_API SHALL return a 404 status code.
4. THE Run_API SHALL allow access with either `read` or `write` scope API keys.

### Requirement 14: Scope-Based Authorization

**User Story:** As a platform operator, I want to enforce scope-based access control on API routes, so that read-only keys cannot perform mutations.

#### Acceptance Criteria

1. WHEN a mutating request (POST, PUT, DELETE) is received with an API key that has `read` scope, THE API_Gateway SHALL return a 403 status code with the body `{ "error": "Insufficient scope" }`.
2. WHEN a GET request is received with an API key that has either `read` or `write` scope, THE API_Gateway SHALL allow the request to proceed.
3. WHEN a POST request is received at `/api/v1/events` with an API key that has `read` scope, THE API_Gateway SHALL return a 403 status code with the body `{ "error": "Insufficient scope" }`.

### Requirement 15: OpenAPI Specification

**User Story:** As an EdTech developer, I want to access a machine-readable OpenAPI 3.1 specification, so that I can generate client SDKs and understand the API contract.

#### Acceptance Criteria

1. THE OpenAPI_Spec_Generator SHALL produce a valid OpenAPI 3.1 JSON object with `info.title` set to `CourseForge Connect API` and `info.version` set to `1.0.0`.
2. THE OpenAPI_Spec_Generator SHALL define a `servers` array containing `{ "url": "/api/v1", "description": "Production" }`.
3. THE OpenAPI_Spec_Generator SHALL define a `securitySchemes` entry named `ApiKeyAuth` using the `http` scheme with `bearer` type.
4. THE OpenAPI_Spec_Generator SHALL include a `paths` entry for each public API route with `summary`, `description`, request body schema, and response schemas for status codes 200, 400, 401, 403, and 429.
5. THE OpenAPI_Spec_Generator SHALL define `components/schemas` entries for `Workflow`, `Run`, `Recipe`, and `ApiError`.
6. WHEN a GET request is received at `/api/v1/openapi.json`, THE API_Gateway SHALL return the OpenAPI specification as JSON with `Content-Type: application/json` and no authentication required.

### Requirement 16: Swagger UI Documentation Page

**User Story:** As an EdTech developer, I want to browse interactive API documentation, so that I can explore and test API endpoints in a browser.

#### Acceptance Criteria

1. WHEN a user navigates to `/developer/docs`, THE Swagger_UI_Page SHALL render the OpenAPI specification using Swagger UI loaded from the `unpkg.com/swagger-ui-dist` CDN.
2. THE Swagger_UI_Page SHALL load the specification from the URL `/api/v1/openapi.json`.

### Requirement 17: Developer Portal Page

**User Story:** As an EdTech developer, I want a portal page to manage my API keys and view usage statistics, so that I can control access and monitor consumption in one place.

#### Acceptance Criteria

1. THE Developer_Portal SHALL display a list of the authenticated tenant's API keys showing `name`, `scope`, `createdAt`, `lastUsedAt`, and `enabled` status.
2. WHEN the user clicks a create button, THE Developer_Portal SHALL open a modal to accept a key `name` and `scope`, call the creation endpoint, and display the raw key once with a copy button and a warning message stating the key cannot be shown again.
3. WHEN the user clicks a revoke button on an existing key, THE Developer_Portal SHALL display a confirmation dialog and, upon confirmation, call the revocation endpoint and update the key list.
4. THE Developer_Portal SHALL include a link to `/developer/docs` for the API reference.
5. THE Developer_Portal SHALL display stub usage statistics showing requests today and requests this month, read from DynamoDB Rate_Limit_Bucket data.

### Requirement 18: Rate Limiter Token Bucket Correctness

**User Story:** As a platform operator, I want the rate limiter to correctly manage token buckets, so that rate limits are enforced accurately under concurrent load.

#### Acceptance Criteria

1. WHEN the first request arrives for a new Token_Bucket, THE Rate_Limiter SHALL initialize the bucket with full capacity, deduct one token, and allow the request.
2. WHEN 100 requests are made within a 60-second window for the same Endpoint_Group and Tenant, THE Rate_Limiter SHALL allow all 100 requests; the 101st request within the same window SHALL receive a 429 response.
3. WHEN the 60-second window expires after tokens are exhausted, THE Rate_Limiter SHALL refill the Token_Bucket and allow subsequent requests to proceed.
