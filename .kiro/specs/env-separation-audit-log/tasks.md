# Tasks: Environment Separation & Audit Log

## Task 1: Audit Types and Utility

- [x] 1.1 Create `packages/types/src/audit.ts` with `ActionType` enum (16 values), `ResourceType` union type, and `AuditEntry` interface
- [x] 1.2 Export audit types from `packages/types/src/index.ts`
- [x] 1.3 Create `packages/utils/src/audit.ts` with `writeAuditLog` function that generates UUID v4 auditId, ISO timestamp, builds PK/SK using existing `tenantPK` and `auditSK` helpers, and calls DynamoDB PutItem
- [x] 1.4 Create `packages/utils/src/audit.test.ts` with unit tests: happy path resolves, DynamoDB error rethrown, two calls with same timestamp produce distinct SKs
- [x] 1.5 Create `packages/utils/src/audit.property.test.ts` with property tests for Property 8 (well-formed entry) and Property 9 (SK uniqueness)

## Task 2: Environment Data Model and Schema

- [x] 2.1 Add `envSK` key builder function to `src/models/schema.ts` following existing pattern: `ENV#{environmentId}`
- [x] 2.2 Add `EnvironmentRecord` interface to `src/models/types.ts` with fields: environmentId, tenantId, name, description, isDefault, createdAt

## Task 3: Tenant Bootstrap

- [x] 3.1 Create `app/lib/tenant-bootstrap.ts` with `bootstrapTenant` function that creates Tenant META record, two Environment_Records (dev with isDefault:true, prod with isDefault:false), and writes TENANT_CREATED audit entry
- [x] 3.2 Create `app/lib/tenant-bootstrap.test.ts` with unit tests: happy path creates all records, DynamoDB error propagation
- [x] 3.3 Create `app/lib/tenant-bootstrap.property.test.ts` with property test for Property 1 (bootstrap creates all required records)

## Task 4: Environment API Handlers

- [x] 4.1 Create `src/api/environments/handler.ts` with `createListEnvironmentsHandler` (returns environments with workflowCount) and `createListWorkflowsByEnvHandler` (validates environmentId, returns filtered workflows)
- [x] 4.2 Create `src/api/environments/handler.test.ts` with unit tests: missing tenantId returns 400, valid responses return 200
- [x] 4.3 Create `src/api/environments/handler.property.test.ts` with property tests for Properties 2 (limit enforcement), 3 (enriched records), 4 (env ID validation), 5 (workflow filtering)
- [x] 4.4 Create Next.js API route `app/api/environments/route.ts` wiring GET to listEnvironments handler
- [x] 4.5 Create Next.js API route `app/api/environments/[environmentId]/workflows/route.ts` wiring GET to listWorkflowsByEnv handler

## Task 5: Workflow Promotion API

- [x] 5.1 Create `src/api/promote/handler.ts` with `createPromoteHandler` that validates tenant ownership, dev environment, PUBLISHED status, creates new prod workflow + version, writes WORKFLOW_PROMOTED audit entry
- [x] 5.2 Create `src/api/promote/handler.test.ts` with unit tests: 404 not found, 400 non-dev, 400 non-published, 201 success response shape
- [x] 5.3 Create `src/api/promote/handler.property.test.ts` with property tests for Property 6 (rejects invalid state) and Property 7 (correct output)
- [x] 5.4 Create Next.js API route `app/api/workflows/[workflowId]/promote/route.ts` wiring POST to promote handler

## Task 6: Audit Query and Export API

- [x] 6.1 Create `src/api/audit/handler.ts` with `createQueryAuditHandler` (paginated query with filters, admin-only) and `createExportAuditHandler` (CSV stream with filters, writes AUDIT_LOG_EXPORTED entry, admin-only)
- [x] 6.2 Create `src/api/audit/csv.ts` with `formatAuditCsv` function that converts audit entries to CSV string with header row and 7 columns
- [x] 6.3 Create `src/api/audit/handler.test.ts` with unit tests: admin role check (403), export headers, AUDIT_LOG_EXPORTED entry written
- [x] 6.4 Create `src/api/audit/handler.property.test.ts` with property tests for Property 10 (filter correctness) and Property 11 (pagination correctness)
- [x] 6.5 Create `src/api/audit/csv.property.test.ts` with property test for Property 12 (CSV format correctness)
- [x] 6.6 Create Next.js API route `app/api/audit/route.ts` wiring GET to queryAudit handler
- [x] 6.7 Create Next.js API route `app/api/audit/export/route.ts` wiring GET to exportAudit handler

## Task 7: Environment Context and Selector UI

- [x] 7.1 Create `app/context/EnvironmentContext.tsx` with React context provider that stores environmentId ('dev' | 'prod'), persists to localStorage key `courseforge_env`, defaults to 'dev'
- [x] 7.2 Create `app/components/EnvironmentSelector.tsx` pill toggle component (Dev / Prod) that reads and updates EnvironmentContext
- [x] 7.3 Integrate EnvironmentSelector into workflows page, runs page, and recipes page layouts
- [x] 7.4 Update workflows page to filter by selected environmentId from EnvironmentContext
- [x] 7.5 Update runs page to filter runs by environmentId of parent workflow

## Task 8: Promote Button on Workflow Detail

- [x] 8.1 Add "Promote to prod" button to workflow detail page, visible only when environmentId is 'dev' and status is 'PUBLISHED'
- [x] 8.2 Wire button click to POST `/api/workflows/:workflowId/promote`, display success (new workflowId, status) or error message

## Task 9: Audit Log Admin UI

- [x] 9.1 Create `app/(dashboard)/admin/audit/page.tsx` with audit table (columns: timestamp, actor, action, resource, detail summary), filter bar (action type dropdown, date range picker, actor search), cursor-based pagination with "Load more" button, and "Export CSV" button
- [x] 9.2 Add admin role check — display 403 forbidden page for non-Admin users
- [x] 9.3 Ensure audit log page is read-only with no delete, edit, or bulk action controls
