# Design Document Critique: CourseForge

This critique evaluates the CourseForge design document against the requirements document, identifying coverage gaps, architectural concerns, data model issues, and areas where the design is silent or inconsistent with stated requirements.

---

## 1. Requirements Coverage Gaps

Roughly a third of the 73 requirements lack adequate design coverage. The gaps fall into a few recurring patterns.

### 1.1 Missing Service Components

Several requirements describe significant platform capabilities for which the design provides no dedicated service, component, or algorithm:

- **CTDL Artifact Rendering (Req 24):** The requirements call for transforming raw CTDL JSON-LD into a structured, human-readable UI with labeled properties and a raw-JSON toggle. The design has no renderer component. This is non-trivial work — CTDL types have different property sets and relationships — and deserves explicit design attention.

- **Web-Based Authoring (Reqs 25-27):** Three requirements describe form-based authoring for Objectives, Assessments, and Learning Experiences, each with real-time schema validation, draft saving, and dependency linking. The design mentions web authoring as a feature but specifies no form validation service, autosave mechanism, or draft management strategy. Given that web authoring is a primary user-facing workflow, this is a significant gap.

- **Download Statistics (Req 50):** The design has no service, data model, or API endpoint for tracking or retrieving download counts. The requirements expect per-version counts, total counts, and CLI-triggered tracking.

- **Platform Metrics (Req 53):** The requirements specify tracking publish attempts, validation failures by type, dependency graph depth, package reuse, and semantic search quality — plus an org-level dashboard and admin export. The design is completely silent on metrics collection, storage, or reporting.

- **License Validation (Req 59):** The manifest includes a `license` field, but there's no validation service for SPDX identifier compliance, no handling for custom license text, and no rendering on the package detail page.

- **Keyword Suggestion (Req 60):** The requirements specify suggesting popular keywords during authoring. The design includes a `keywords` array in the manifest but no suggestion mechanism or keyword popularity tracking.

- **README Validation and Rendering (Req 70):** The `PackageVersion` model includes a `readme: string`, but the design doesn't describe validation that a README exists before publishing, markdown rendering for the package detail page, or README content indexing for search.

- **Release Channels (Req 73):** The manifest has a `channel` field in `PublishConfig`, but there's no `Channel` entity, no service for channel-based version resolution, and no API endpoint for listing versions by channel. The Dependency Resolver doesn't mention channel-aware resolution.

### 1.2 Missing API Endpoints

The design's API Interfaces section is incomplete relative to the requirements:

- **No CTDL import/export endpoints** (Req 3) — the requirements describe importing and exporting packages as CTDL JSON-LD, but no API endpoints exist for this.
- **No version diff endpoint** (Req 17) — `forge diff` is listed as a CLI command but there's no API to retrieve and compare two versions.
- **No objective-first discovery endpoint** (Req 14) — the `forge add objective` workflow requires an API that returns compatible assessments and learning experiences for a given objective. No such endpoint exists.
- **No download statistics endpoint** (Req 50) — no way to retrieve download counts.
- **No platform metrics endpoints** (Req 53) — no admin dashboard API.
- **No audit log query endpoint** (Req 69) — the Audit Logger has a `queryLogs` method but no corresponding REST endpoint.
- **No notification management endpoints** (Req 71) — no API for notification history, preference updates, or notification delivery status.
- **No package promotion endpoint** (Req 67) — `PackageService.promotePackage()` exists but no REST endpoint.
- **No environment management endpoints** (Reqs 49, 68) — no API for managing registry environments.
- **No release channel endpoints** (Req 73) — no API for listing or filtering by channel.

### 1.3 Missing Correctness Properties

The design defines 27 correctness properties, but several requirement areas lack formal properties:

- **Review workflows (Reqs 32-34):** No property ensures that a PR requires N approvals before merging, or that self-approval is blocked unless configured. These are critical governance guarantees.
- **Download statistics (Req 50):** No property for download count accuracy.
- **README enforcement (Req 70):** No property ensuring a README is present before publishing.
- **Notification delivery (Req 71):** No property guaranteeing notifications fire for deprecation, new versions, or security advisories.
- **Release channel resolution (Req 73):** No property ensuring the dependency resolver defaults to the stable channel.

---

## 2. Architectural Concerns

### 2.1 No Background Job Processing

The requirements describe several inherently asynchronous operations: embedding generation within 5 minutes of publication (Req 56), notification delivery across multiple channels (Req 71), background re-embedding for model updates (Req 56.11), and metrics aggregation (Req 53). The design has no job queue, worker architecture, or async processing mechanism. Using Next.js API routes alone cannot handle these reliably — they're request-scoped and subject to timeout limits. The design needs a background job system (e.g., BullMQ, pg-boss, or a dedicated worker service).

### 2.2 No Caching Strategy

The requirements set aggressive performance targets: 200ms p95 for API requests, 500ms for keyword search, 2s for semantic search (Req 72). The design specifies React Query for client-side caching but has no server-side caching layer. There's no mention of Redis, CDN for package bundles, or database query caching. For a registry serving repeated lookups of popular packages, this is a meaningful omission.

### 2.3 Monolithic API in Next.js

The design routes all traffic — web UI, CLI, and Consumer API — through Next.js API routes. This creates several concerns:

- **Scaling:** The Consumer API and CLI may have very different traffic patterns than the web UI. Bundling them together prevents independent scaling.
- **Deployment coupling:** A frontend change forces redeployment of the API.
- **Rate limiting:** The Consumer API requires rate limiting (Req 51.5) but the design doesn't describe how rate limiting is applied differently to the Consumer API vs. internal APIs.

Consider whether the Consumer API should be a separate service, or at minimum describe how these concerns are addressed within the monolith.

### 2.4 CLI–Server Logic Sharing is Underspecified

The design states the CLI has "full feature parity" with the web for core workflows and mentions "shared business logic implemented as reusable services." But the architecture is ambiguous: does the CLI embed business logic locally, or does it call the server API? The answer matters significantly:

- If the CLI calls the server, then the "shared logic" claim is misleading — the CLI is just an API client.
- If the CLI embeds business logic, there's a substantial code-sharing challenge between a Next.js server and a standalone Node.js CLI.

The design should explicitly state that the CLI is an API client and that "shared logic" means the API is the single source of truth, or describe a monorepo package-sharing strategy.

### 2.5 Package Bundle Storage is a Black Box

The design mentions "Object storage for package bundles (S3-compatible)" and the `PackageVersion` has a `bundleUrl` field, but there's no storage service, no upload/download flow, no CDN strategy, and no description of how bundles are assembled from artifacts. Given that package storage and retrieval is the core function of a registry, this needs more detail.

---

## 3. Data Model Issues

### 3.1 PackageVersion is Overloaded

The `PackageVersion` interface stores `artifacts`, `embeddings`, `qualityGateResults`, and `readme` directly. In the relational database, these should be separate tables for normalization, query efficiency, and storage management. Storing embeddings (which are large vectors) directly on the version entity means every version query pulls vectors, even when they aren't needed.

### 3.2 Environment Model is Incorrect

`Environment.packageCatalog: Package[]` stores the entire package catalog in the entity. This is not how relational databases work. Packages should have an `environmentId` foreign key, or there should be a join table. The current model suggests the entire catalog is loaded as a nested array.

### 3.3 Missing Channel Entity

Release Channels (Req 73) are a first-class concept in the requirements but have no corresponding data model entity. The `PublishConfig.channel` field in the manifest is insufficient — the system needs to track which channels exist, which versions belong to which channels, and which channel is the default for dependency resolution.

### 3.4 Dependency.dependencyType Duplicates Information

The `dependencyType` field on the `Dependency` entity duplicates the `type` field of the dependency target package. This creates a consistency risk — if the dependency package's type changes (which shouldn't happen, but the model doesn't prevent it), the dependency record becomes stale. It would be cleaner to derive this from the referenced package.

### 3.5 Missing Data Models

- **Notification:** No entity for storing notification history (Req 71 specifies a notification history view).
- **DownloadRecord:** No entity for tracking per-version download events.
- **MetricEvent:** No entity for platform metrics (Req 53).
- **ReviewConfiguration:** No entity for storing org-level review requirements like approval thresholds and self-approval settings (Req 34).

### 3.6 Database Schema is Incomplete

The "Key Indexes" section lists only five indexes. A production registry would need many more:

- `package_versions(packageId, version)` — for version lookups
- `package_versions(packageId, lifecycleState)` — for filtering by state
- `pull_requests(packageId, status)` — for listing open PRs
- `packages(ownerId)` — for listing packages by owner
- `audit_logs(entityId, entityType)` — for entity-specific audit queries
- `organization_members(userId)` — for checking membership

---

## 4. API Design Concerns

### 4.1 No API Versioning

All endpoints use `/api/` with no version prefix. This makes it impossible to evolve the API without breaking existing CLI versions. Given that the CLI is a distributed client that users may not upgrade immediately, API versioning (e.g., `/api/v1/`) is essential from day one.

### 4.2 No Pagination Specification

Multiple endpoints return lists (packages, search results, PRs, audit logs) but the design doesn't specify pagination parameters, cursor vs. offset pagination, or default page sizes. This should be standardized across all list endpoints.

### 4.3 Consumer API Lacks Isolation

The Consumer API shares the `/api/` path prefix with internal APIs. It needs clear isolation for rate limiting (Req 51.5), independent scaling, and potential public exposure. Consider a distinct prefix or subdomain.

### 4.4 Inconsistent Resource Patterns

Some endpoints use deeply nested resources (`/api/packages/:id/versions/:version/publish`) while the Consumer API uses flat resources (`/api/consumer/artifacts/:artifactId`). The design should establish a consistent convention.

---

## 5. Error Handling and Operational Concerns

### 5.1 Missing Rate Limiting Errors

The Consumer API specifies rate limiting (Req 51.5) but the error handling section doesn't describe 429 Too Many Requests responses, rate limit headers, or backoff guidance.

### 5.2 No Idempotency Strategy

Publish operations, package promotions, and state transitions could be retried by CLI users or automated systems. The design doesn't describe idempotency keys or idempotent endpoint behavior, which risks duplicate operations.

### 5.3 Audit Logging Failure is Too Lenient

The Graceful Degradation section says the system "continues operation even if audit log write fails." But Req 69 treats audit logging as critical — it's required for accountability and has a 2-year retention mandate. Silently dropping audit records undermines the requirement. Consider whether audit failures should block the operation, or at minimum be captured in a dead-letter queue for recovery.

---

## 6. Testing Strategy Gaps

### 6.1 No Contract Testing

With the CLI and web both consuming the same API, contract tests (e.g., Pact) would catch API-breaking changes before they reach CLI users. The testing strategy doesn't mention this.

### 6.2 No Data Migration Testing

The database schema will evolve. The testing strategy should include migration tests to verify that schema changes preserve existing data and don't break running queries.

### 6.3 No Chaos/Resilience Testing

For a platform targeting 99.5% uptime (Req 72), the testing strategy should include failure injection or chaos testing — what happens when the embedding API is down, PostgreSQL is slow, or S3 is unreachable? The graceful degradation section describes intended behavior, but there's no testing to verify it.

### 6.4 Coverage Target Seems Low

80% coverage for a registry that stores immutable, versioned artifacts feels insufficient. The immutability, access control, and dependency resolution paths in particular should approach near-complete coverage.

---

## 7. Minor Issues

- **Technology version specificity:** The design specifies "Next.js 14+" and "PostgreSQL 15+" but the embedding API is "OpenAI or similar" — this should be more concrete given the semantic search is a core feature.
- **Prisma ORM may not support pgvector natively** — the design should acknowledge this and specify how vector columns and operations are handled (raw SQL, Prisma extensions, etc.).
- **No mention of CORS** — the Consumer API is intended for third-party use and will likely need CORS configuration.
- **No mention of API documentation** — a public Consumer API needs published documentation (OpenAPI/Swagger), but this isn't addressed.

---

## Summary

The design is strongest in its core domain modeling (packages, versions, dependencies, lifecycle states) and provides clear TypeScript interfaces for the major services. The correctness properties are a notable strength — formalizing 27 testable invariants adds rigor.

The most significant weaknesses are:

1. **Missing infrastructure design** — no background job processing, no caching, no package bundle storage flow
2. **~25 requirements with inadequate coverage** — especially web authoring, metrics, notifications, channels, and import/export
3. **Incomplete API surface** — missing endpoints for roughly a dozen features
4. **CLI architecture ambiguity** — the core question of "API client vs. embedded logic" is unresolved
5. **Data model denormalization** — PackageVersion carries too much; several entities are missing entirely
