# Implementation Plan: Developer REST API

## Overview

Implement a public, versioned REST API (`/api/v1/`) for CourseForge Connect with API key authentication, per-tenant rate limiting, scope enforcement, and OpenAPI documentation. The implementation follows the existing handler-factory + repository pattern in `src/api/`, with thin Next.js route files in `app/api/`. All new DynamoDB records use the existing single-table design with new key prefixes for `APIKEY#` and `RATELIMIT#` items, plus a new GSI on `hashedKey`.

## Tasks

- [ ] 1. Add schema key builders and shared types
  - [ ] 1.1 Add API key and rate limit key builders to `src/models/schema.ts`
    - Add `apiKeySK(keyId)`, `rateLimitPK(tenantId, endpointGroup)`, `RATE_LIMIT_SK`, and `GSI_HASHED_KEY` constants
    - Add `KEY_PREFIX.APIKEY` and `KEY_PREFIX.RATELIMIT` entries
    - _Requirements: 1.3, 5.1_
  - [ ] 1.2 Add API key types to `packages/types/src/`
    - Create `packages/types/src/api-keys.ts` with `ApiKeyRecord`, `ApiKeyScope`, and `EndpointGroup` types
    - Export from `packages/types/src/index.ts`
    - _Requirements: 1.3, 5.2_

- [ ] 2. Implement API Key Manager handler and repository
  - [ ] 2.1 Create `src/api/developer-keys/repository.ts`
    - Implement `ApiKeyRepository` interface with DynamoDB operations: `create`, `listByTenant`, `getByKeyId`, `revoke`, `findByHash` (GSI query), `updateLastUsed`
    - Use `TENANT#{tenantId}` PK, `APIKEY#{keyId}` SK pattern
    - Use `GSI_HASHED_KEY` index for `findByHash`
    - _Requirements: 1.1, 1.3, 2.1, 3.1, 4.1, 4.4_
  - [ ] 2.2 Create `src/api/developer-keys/handler.ts`
    - Implement `createApiKeyHandler(repo)` factory returning `create`, `list`, `revoke` methods
    - `create`: generate 32-byte random key, format as `cfk_live_{base64url}`, SHA-256 hash, store via repo, return raw key once
    - `list`: return all keys for tenant excluding `hashedKey` and raw key
    - `revoke`: set `enabled=false` and `deletedAt`, return 404 if key not found for tenant
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 3.1, 3.2_
  - [ ]* 2.3 Write property tests for API Key Manager (`src/api/developer-keys/handler.property.test.ts`)
    - **Property 1: API key creation round-trip** — verify key format, hash consistency, stored fields, response shape
    - **Property 2: API key listing returns all keys with required fields and no secrets**
    - **Property 3: API key revocation sets enabled to false**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 3.1**
  - [ ]* 2.4 Write unit tests for API Key Manager (`src/api/developer-keys/handler.test.ts`)
    - Test create happy path, invalid input (400), list shape, revoke happy path, revoke wrong tenant (404)
    - _Requirements: 1.1–1.4, 2.1–2.2, 3.1–3.2_

- [ ] 3. Implement API Key Auth Middleware
  - [ ] 3.1 Create `src/api/middleware/api-key-auth.ts`
    - Implement `createApiKeyAuthMiddleware(repo)` that extracts Bearer token, SHA-256 hashes it, looks up via `findByHash`, returns `AuthContext` or 401 response
    - Fire-and-forget `updateLastUsed` on successful auth
    - Return `{ "error": "Invalid or revoked API key" }` for missing header, invalid token, disabled key
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  - [ ]* 3.2 Write property tests for auth middleware (`src/api/middleware/api-key-auth.property.test.ts`)
    - **Property 4: Auth middleware correctness** — valid token returns AuthContext, invalid/revoked returns 401
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.5**
  - [ ]* 3.3 Write unit tests for auth middleware (`src/api/middleware/api-key-auth.test.ts`)
    - Test valid key, disabled key, missing header, malformed token, lastUsedAt async update
    - _Requirements: 4.1–4.5_

- [ ] 4. Implement Rate Limiter Middleware
  - [ ] 4.1 Create `src/api/middleware/rate-limiter.ts`
    - Implement `classifyEndpointGroup(method, path)` — returns `'events'`, `'read'`, or `'write'`
    - Implement `RateLimitRepository` with DynamoDB conditional writes and optimistic locking
    - Implement `createRateLimiter(repo, config?)` with token bucket algorithm: refill proportionally, deduct one token, return `allowed` or `retryAfterSeconds`
    - Default capacity 100 requests per 60-second window
    - Retry up to 3 times on `ConditionalCheckFailedException`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 18.1, 18.2, 18.3_
  - [ ]* 4.2 Write property tests for rate limiter (`src/api/middleware/rate-limiter.property.test.ts`)
    - **Property 5: Endpoint group classification**
    - **Property 6: Token bucket refill calculation**
    - **Property 7: Token bucket boundary enforcement** — 100 allowed, 101st rejected
    - **Property 8: Token bucket refill restores capacity**
    - **Validates: Requirements 5.2, 5.3, 5.4, 5.5, 18.1, 18.2, 18.3**
  - [ ]* 4.3 Write unit tests for rate limiter (`src/api/middleware/rate-limiter.test.ts`)
    - Test bucket initialization, exhaustion, refill, conditional write retry, endpoint classification
    - _Requirements: 5.1–5.6, 18.1–18.3_

- [ ] 5. Implement Scope Enforcer Middleware
  - [ ] 5.1 Create `src/api/middleware/scope-enforcer.ts`
    - Implement `enforceScopeForRequest(scope, method, path)` — returns null if allowed, 403 response if denied
    - `read` scope blocks POST/PUT/DELETE; `write` scope allows all; GET always allowed
    - Special case: POST `/api/v1/events` requires `write` scope
    - _Requirements: 14.1, 14.2, 14.3_
  - [ ]* 5.2 Write property tests for scope enforcer (`src/api/middleware/scope-enforcer.property.test.ts`)
    - **Property 10: Scope enforcement** — read scope + mutation = 403, GET always allowed
    - **Validates: Requirements 14.1, 14.2, 14.3**
  - [ ]* 5.3 Write unit tests for scope enforcer (`src/api/middleware/scope-enforcer.test.ts`)
    - Test read scope with GET, POST, DELETE; write scope with all methods; events endpoint
    - _Requirements: 14.1–14.3_

- [ ] 6. Checkpoint - Ensure all middleware tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implement V1 Route Handlers
  - [ ] 7.1 Create `src/api/v1/recipes.ts`
    - Implement `createV1RecipeHandler(repo)` that queries template records and returns recipe objects with `id`, `name`, `description`, `category`, `standards`, `estimatedMinutes`
    - _Requirements: 6.1, 6.2_
  - [ ]* 7.2 Write property and unit tests for recipes handler (`src/api/v1/recipes.property.test.ts`, `src/api/v1/recipes.test.ts`)
    - **Property 16: Recipe listing returns complete objects**
    - **Validates: Requirements 6.1, 6.2**
  - [ ] 7.3 Create `src/api/v1/workflows.ts`
    - Implement `createV1WorkflowHandler(deps)` with `create`, `list`, `getById`, `publish` methods
    - `create`: validate body (`name`, `recipeId`, `params`, `environmentId`, `connectionIds`), delegate to existing workflow creation logic, return `workflowId`, `versionId`, `status`
    - `list`: support `status` and `environmentId` query filters
    - `getById`: return workflow detail excluding compiled plan secrets, 404 for wrong tenant
    - `publish`: delegate to existing publish logic, 404 for wrong tenant
    - _Requirements: 7.1, 7.2, 7.3, 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4, 10.1, 10.2, 10.3_
  - [ ]* 7.4 Write property and unit tests for workflows handler (`src/api/v1/workflows.property.test.ts`, `src/api/v1/workflows.test.ts`)
    - **Property 9: Invalid input validation returns 400** (workflow creation)
    - **Property 13: Workflow listing filters correctly**
    - **Property 15: Response masking excludes sensitive data** (workflow detail)
    - **Validates: Requirements 7.1–7.3, 8.1–8.4, 9.1–9.4, 10.1–10.3**
  - [ ] 7.5 Create `src/api/v1/events.ts`
    - Implement `createV1EventHandler(deps)` that validates `workflowId` + `payload`, checks workflow ownership and PUBLISHED status, publishes DomainEvent to EventBridge, creates Run record with `triggerType: 'api'`, returns `runId` + `traceId`
    - Return 409 for wrong tenant or non-PUBLISHED workflow, 400 for missing fields
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_
  - [ ]* 7.6 Write property and unit tests for events handler (`src/api/v1/events.property.test.ts`, `src/api/v1/events.test.ts`)
    - **Property 9: Invalid input validation returns 400** (event triggering)
    - **Property 11: Event triggering ownership and status validation**
    - **Property 12: Event triggering creates correct domain event and run record**
    - **Validates: Requirements 11.1–11.5**
  - [ ] 7.7 Create `src/api/v1/runs.ts`
    - Implement `createV1RunHandler(repo)` with `list` and `getById` methods
    - `list`: support `workflowId`, `status`, `limit` (default 50), `cursor` query params; exclude sensitive payload data
    - `getById`: return run detail with step summary, exclude raw payloads, 404 for wrong tenant
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 13.1, 13.2, 13.3, 13.4_
  - [ ]* 7.8 Write property and unit tests for runs handler (`src/api/v1/runs.property.test.ts`, `src/api/v1/runs.test.ts`)
    - **Property 14: Run listing filters and pagination**
    - **Property 15: Response masking excludes sensitive data** (runs)
    - **Validates: Requirements 12.1–12.6, 13.1–13.4**

- [ ] 8. Checkpoint - Ensure all handler tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Implement OpenAPI Spec Generator
  - [ ] 9.1 Create `src/api/v1/openapi.ts`
    - Implement `generateOpenApiSpec()` returning a static OpenAPI 3.1 JSON object
    - Set `info.title` to `CourseForge Connect API`, `info.version` to `1.0.0`
    - Define `servers` array with `{ "url": "/api/v1", "description": "Production" }`
    - Define `securitySchemes.ApiKeyAuth` with `http` scheme, `bearer` type
    - Include `paths` entries for all public routes with summaries, request/response schemas, and error codes (200, 400, 401, 403, 429)
    - Define `components/schemas` for `Workflow`, `Run`, `Recipe`, `ApiError`
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_
  - [ ]* 9.2 Write unit tests for OpenAPI spec (`src/api/v1/openapi.test.ts`)
    - Validate spec structure, required fields, paths, schemas, security schemes
    - _Requirements: 15.1–15.6_

- [ ] 10. Wire Next.js API routes
  - [ ] 10.1 Create `app/api/developer/keys/route.ts`
    - Wire POST (create) and GET (list) to `createApiKeyHandler` with DynamoDB repository
    - Use session-based tenant ID for developer key management routes
    - _Requirements: 1.1, 2.1_
  - [ ] 10.2 Create `app/api/developer/keys/[keyId]/route.ts`
    - Wire DELETE (revoke) to `createApiKeyHandler.revoke`
    - _Requirements: 3.1_
  - [ ] 10.3 Create `app/api/v1/recipes/route.ts`
    - Wire GET through auth → rate limiter → scope enforcer → recipe handler
    - _Requirements: 6.1_
  - [ ] 10.4 Create `app/api/v1/workflows/route.ts`
    - Wire POST (create) and GET (list) through middleware chain
    - _Requirements: 7.1, 8.1_
  - [ ] 10.5 Create `app/api/v1/workflows/[workflowId]/route.ts`
    - Wire GET (detail) through middleware chain
    - _Requirements: 9.1_
  - [ ] 10.6 Create `app/api/v1/workflows/[workflowId]/publish/route.ts`
    - Wire POST (publish) through middleware chain
    - _Requirements: 10.1_
  - [ ] 10.7 Create `app/api/v1/events/route.ts`
    - Wire POST through auth → rate limiter (events group) → scope enforcer → event handler
    - _Requirements: 11.1_
  - [ ] 10.8 Create `app/api/v1/runs/route.ts`
    - Wire GET (list) through middleware chain
    - _Requirements: 12.1_
  - [ ] 10.9 Create `app/api/v1/runs/[runId]/route.ts`
    - Wire GET (detail) through middleware chain
    - _Requirements: 13.1_
  - [ ] 10.10 Create `app/api/v1/openapi.json/route.ts`
    - Wire GET to `generateOpenApiSpec()` with no authentication required
    - Return JSON with `Content-Type: application/json`
    - _Requirements: 15.6_

- [ ] 11. Implement Developer Portal and Swagger UI pages
  - [ ] 11.1 Create `app/(dashboard)/developer/docs/page.tsx`
    - Render Swagger UI loaded from `unpkg.com/swagger-ui-dist` CDN
    - Point at `/api/v1/openapi.json` spec URL
    - _Requirements: 16.1, 16.2_
  - [ ] 11.2 Create `app/(dashboard)/developer/page.tsx`
    - Display API key list with `name`, `scope`, `createdAt`, `lastUsedAt`, `enabled`
    - Create key modal: accept `name` and `scope`, display raw key once with copy button and warning
    - Revoke key: confirmation dialog, call DELETE endpoint, refresh list
    - Link to `/developer/docs`
    - Display stub usage statistics (requests today, requests this month)
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

- [ ] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The design uses TypeScript throughout, matching the existing codebase
- All handler factories follow the `createXxxHandler(deps)` pattern with injected repositories
- Next.js route files are thin wiring layers that instantiate DynamoDB clients and pass them to handlers
