# Tasks: Environment Separation & Audit Log

## Task 1: Audit Types and Utility

- [ ] 1.1 Create `packages/types/src/audit.ts` with `ActionType` enum (16 values), `ResourceType` union type, and `AuditEntry` interface
- [ ] 1.2 Export audit types from `packages/types/src/index.ts`
- [ ] 1.3 Create `packages/utils/src/audit.ts` with `writeAuditLog` function that generates UUID v4 auditId, ISO timestamp, builds PK/SK using existing `tenantPK` and `auditSK` helpers, and calls DynamoDB PutItem
- [ ] 1.4 Create `packages/utils/src/audit.test.ts` with unit tests: happy path resolves, DynamoDB error rethrown, two calls with same timestamp produce distinct SKs
- [ ] 1.5 Create `packages/utils/src/audit.property.test.ts` with property tests for Property 8 (well-formed entry) and Property 9 (SK uniqueness)

## Task 2: Environment Data Model and Schema

- [ ] 2.1 Add `envSK` key builder function to `src/models/schema.ts` following existing pattern: `ENV#{environmentId}`
- [ ] 2.2 Add `EnvironmentRecord` interface to `src/models/types.ts` with fields: environmentId, tenantId, name, description, isDefault, createdAt

## Task 3: Tenant Bootstrap

- [ ] 3.1 Create `app/lib/tenant-bootstrap.ts` with `bootstrapTenant` function that creates Tenant META record, two Environment_Records (dev with isDefault:true, prod with isDefault:false), and writes TENANT_CREATED audit entry
- [ ] 3.2 Create `app/lib/tenant-bootstrap.test.ts` with unit tests: happy path creates all records, DynamoDB error propagation
- [ ] 3.3 Create `app/lib/tenant-bootstrap.property.test.ts` with property test for Property 1 (bootstrap creates all required records)

## Task 4: Environment API Handlers

- [ ] 4.1 Create `src/api/environments/handler.ts` with `createListEnvironmentsHandler` (returns environments with workflowCount) and `createListWorkflowsByEnvHandler` (validates environmentId, returns filtered workflows)
- [ ] 4.2 Create `src/api/environments/handler.test.ts` with unit tests: missing tenantId returns 400, valid responses return 200
- [ ] 4.3 Create `src/api/environments/handler.property.test.ts` with property tests for Properties 2 (limit enforcement), 3 (enriched records), 4 (env ID validation), 5 (workflow filtering)
- [ ] 4.4 Create Next.js API route `app/api/environments/route.ts` wiring GET to listEnvironments handler
- [ ] 4.5 Create Next.js API route `app/api/environments/[environmentId]/workflows/route.ts` wiring GET to listWorkflowsByEnv handler

## Task 5: Workflow Promotion API

- [ ] 5.1 Create `src/api/promote/handler.ts` with `createPromoteHandler` that validates tenant ownership, dev environment, PUBLISHED status, creates new prod workflow + version, writes WORKFLOW_PROMOTED audit entry
- [ ] 5.2 Create `src/api/promote/handler.test.ts` with unit tests: 404 not found, 400 non-dev, 400 non-published, 201 success response shape
- [ ] 5.3 Create `src/api/promote/handler.property.test.ts` with property tests for Property 6 (rejects invalid state) and Property 7 (correct output)
- [ ] 5.4 Create Next.js API route `app/api/workflows/[workflowId]/promote/route.ts` wiring POST to promote handler

## Task 6: Audit Query and Export API

- [ ] 6.1 Create `src/api/audit/handler.ts` with `createQueryAuditHandler` (paginated query with filters, admin-only) and `createExportAuditHandler` (CSV stream with filters, writes AUDIT_LOG_EXPORTED entry, admin-only)
- [ ] 6.2 Create `src/api/audit/csv.ts` with `formatAuditCsv` function that converts audit entries to CSV string with header row and 7 columns
- [ ] 6.3 Create `src/api/audit/handler.test.ts` with unit tests: admin role check (403), export headers, AUDIT_LOG_EXPORTED entry written
- [ ] 6.4 Create `src/api/audit/handler.property.test.ts` with property tests for Property 10 (filter correctness) and Property 11 (pagination correctness)
- [ ] 6.5 Create `src/api/audit/csv.property.test.ts` with property test for Property 12 (CSV format correctness)
- [ ] 6.6 Create Next.js API route `app/api/audit/route.ts` wiring GET to queryAudit handler
- [ ] 6.7 Create Next.js API route `app/api/audit/export/route.ts` wiring GET to exportAudit handler

## Task 7: Environment Context and Selector UI

- [ ] 7.1 Create `app/context/EnvironmentContext.tsx` with React context provider that stores environmentId ('dev' | 'prod'), persists to localStorage key `courseforge_env`, defaults to 'dev'
- [ ] 7.2 Create `app/components/EnvironmentSelector.tsx` pill toggle component (Dev / Prod) that reads and updates EnvironmentContext
- [ ] 7.3 Integrate EnvironmentSelector into workflows page, runs page, and recipes page layouts
- [ ] 7.4 Update workflows page to filter by selected environmentId from EnvironmentContext
- [ ] 7.5 Update runs page to filter runs by environmentId of parent workflow

## Task 8: Promote Button on Workflow Detail

- [ ] 8.1 Add "Promote to prod" button to workflow detail page, visible only when environmentId is 'dev' and status is 'PUBLISHED'
- [ ] 8.2 Wire button click to POST `/api/workflows/:workflowId/promote`, display success (new workflowId, status) or error message

## Task 9: Audit Log Admin UI

- [ ] 9.1 Create `app/(dashboard)/admin/audit/page.tsx` with audit table (columns: timestamp, actor, action, resource, detail summary), filter bar (action type dropdown, date range picker, actor search), cursor-based pagination with "Load more" button, and "Export CSV" button
- [ ] 9.2 Add admin role check — display 403 forbidden page for non-Admin users
- [ ] 9.3 Ensure audit log page is read-only with no delete, edit, or bulk action controls
