# Design Document: Workflow Management UI

## Overview

The Workflow Management UI enhances the existing workflow pages in CourseForge Connect with a full-featured list page (filtering, row actions, context menus), a detail page with sidebar metadata and four tabbed panels (Configuration, Trigger, Connections, Version History), four confirmation modals (Publish, Pause, Archive, Promote), a CronPickerModal, and shared components (WorkflowStatusBadge, StepSummaryCard). The UI is built on the existing Next.js App Router + Tailwind CSS stack and calls the Workflow Management API endpoints.

### Key Design Decisions

1. **Enhance existing pages** — `app/(dashboard)/workflows/page.tsx` and `app/(dashboard)/workflows/[workflowId]/page.tsx` already exist with basic implementations. We extend them rather than replacing from scratch, preserving the established page patterns (EnvironmentSelector, gradient background, rounded cards).
2. **Extract pure UI logic into `app/lib/workflow-ui-utils.ts`** — Status badge color mapping, action button visibility rules, status filter logic, and cron validation are pure functions that can be property-tested independently of React.
3. **Reuse `maskSensitiveFields`** from `app/lib/mask-sensitive.ts` for StepSummaryCard secret masking rather than duplicating logic.
4. **Client-side status filtering** — The API already returns all workflows for an environment. Status filtering is applied client-side to avoid extra API calls, matching the pattern in the runs page.
5. **Optimistic UI for lifecycle actions** — Publish, Pause, and Archive modals apply optimistic status updates and revert on failure, providing responsive feedback.
6. **Component colocation** — Shared components (WorkflowStatusBadge, StepSummaryCard, PublishChecklist, CronPickerModal) live in `app/components/` alongside EnvironmentSelector.

## Architecture

```mermaid
graph TD
    subgraph Pages
        WLP[WorkflowsPage<br/>workflows/page.tsx]
        WDP[WorkflowDetailPage<br/>workflows/[workflowId]/page.tsx]
    end

    subgraph Shared Components
        WSB[WorkflowStatusBadge]
        SSC[StepSummaryCard]
        PC[PublishChecklist]
        CPM[CronPickerModal]
        ES[EnvironmentSelector]
    end

    subgraph Modals
        PM[PublishModal]
        PAM[PauseModal]
        AM[ArchiveModal]
        PRM[PromoteModal]
    end

    subgraph Context
        EC[EnvironmentContext]
    end

    subgraph Pure Logic
        WUU[workflow-ui-utils.ts]
        MS[mask-sensitive.ts]
    end

    subgraph API Routes
        LAPI[GET /api/environments/:envId/workflows]
        DAPI[GET /api/workflows/:id]
        PAPI[POST /api/workflows/:id/publish]
        PAAPI[POST /api/workflows/:id/pause]
        AAPI[POST /api/workflows/:id/archive]
        VAPI[GET /api/workflows/:id/versions]
        PRAPI[POST /api/workflows/:id/promote]
    end

    WLP --> ES
    WLP --> WSB
    WLP --> EC
    WLP --> WUU
    WLP --> LAPI
    WLP --> PM
    WLP --> PAM
    WLP --> AM
    WLP --> PRM

    WDP --> WSB
    WDP --> SSC
    WDP --> PC
    WDP --> CPM
    WDP --> EC
    WDP --> WUU
    WDP --> MS
    WDP --> DAPI
    WDP --> VAPI
    WDP --> PM
    WDP --> PAM
    WDP --> AM
    WDP --> PRM

    PM --> PAPI
    PAM --> PAAPI
    AM --> AAPI
    PRM --> PRAPI

    SSC --> MS
```

### Data Flow

1. **List page**: `EnvironmentContext` → fetch workflows → client-side status filter via `filterWorkflowsByStatus()` → render table with `WorkflowStatusBadge` and context menu
2. **Detail page**: URL param `workflowId` → fetch workflow detail → render sidebar + tabs. Tabs lazy-load their data (versions tab fetches on mount).
3. **Lifecycle modals**: User action → open modal → confirm → POST to API → optimistic update → revert on error
4. **Secret masking**: `maskSensitiveFields()` applied to step params before rendering in StepSummaryCard

## Components and Interfaces

### WorkflowStatusBadge (`app/components/WorkflowStatusBadge.tsx`)

```typescript
type WorkflowStatus = 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'ARCHIVED';

interface WorkflowStatusBadgeProps {
  status: string;
}

// Pure mapping function (in workflow-ui-utils.ts)
function getStatusBadgeClasses(status: string): string;
// Returns Tailwind classes: DRAFT→slate, PUBLISHED→emerald, PAUSED→amber, ARCHIVED→rose
// Unknown statuses fall back to slate
```

### StepSummaryCard (`app/components/StepSummaryCard.tsx`)

```typescript
interface StepSummaryCardProps {
  index: number;
  connectorIcon?: string;
  label: string;
  params: Record<string, unknown>;
}
// Internally calls maskSensitiveFields(params) before rendering
```

### PublishChecklist (`app/components/PublishChecklist.tsx`)

```typescript
interface ChecklistItem {
  label: string;
  passed: boolean;
}

interface PublishChecklistProps {
  items: ChecklistItem[];
}

// Pure function (in workflow-ui-utils.ts)
function buildPublishChecklist(workflow: WorkflowDetail): ChecklistItem[];
// Checks: all connections active, trigger configured, at least one step present
```

### CronPickerModal (`app/components/CronPickerModal.tsx`)

```typescript
interface CronPickerModalProps {
  open: boolean;
  initialCron?: string;
  onSave: (cron: string) => void;
  onClose: () => void;
}

// Pure functions (in workflow-ui-utils.ts)
function parseCronExpression(cron: string): { valid: boolean; error?: string };
function cronToPlainLanguage(cron: string): string;
function getNextRunTimes(cron: string, count: number): Date[];
function isMinimumInterval(cron: string, minMinutes: number): boolean;
```

### Confirmation Modals

```typescript
// Shared modal pattern
interface ConfirmModalProps {
  open: boolean;
  workflowId: string;
  workflowName: string;
  onConfirm: () => void;
  onClose: () => void;
}

// PublishModal extends with checklist
interface PublishModalProps extends ConfirmModalProps {
  checklistItems: ChecklistItem[];
}

// ArchiveModal needs current status to show warning
interface ArchiveModalProps extends ConfirmModalProps {
  currentStatus: string;
}

// PromoteModal shows result link
interface PromoteModalProps extends ConfirmModalProps {
  onSuccess: (newWorkflowId: string) => void;
}
```

### Context Menu Actions

```typescript
// Pure function (in workflow-ui-utils.ts)
type ContextMenuAction = 'publish' | 'pause' | 'archive' | 'view-runs' | 'promote';

function getAvailableActions(
  status: string,
  environmentId: string,
): ContextMenuAction[];
// Returns which context menu items to show based on status and environment
// "Promote to prod" only visible when environmentId === 'dev'
```

### Sidebar Action Buttons

```typescript
// Pure function (in workflow-ui-utils.ts)
type SidebarAction = 'publish' | 'pause' | 'archive' | 'promote';

function getSidebarActions(
  status: string,
  environmentId: string,
): SidebarAction[];
// DRAFT → ['publish']
// PUBLISHED → ['pause', 'archive'] + 'promote' if env=dev
// PAUSED → ['publish', 'archive']
// ARCHIVED → []
```

### Pure Logic Module (`app/lib/workflow-ui-utils.ts`)

Consolidates all pure, testable UI logic:

| Function | Purpose |
|----------|---------|
| `getStatusBadgeClasses(status)` | Maps status string to Tailwind badge classes |
| `filterWorkflowsByStatus(workflows, status)` | Filters workflow array by status (or returns all if status is 'All') |
| `getAvailableActions(status, env)` | Returns context menu actions for a workflow row |
| `getSidebarActions(status, env)` | Returns sidebar action buttons for detail page |
| `buildPublishChecklist(workflow)` | Builds pre-flight checklist items |
| `parseCronExpression(cron)` | Validates 5-field cron syntax |
| `isMinimumInterval(cron, minMinutes)` | Checks cron meets minimum interval |
| `cronToPlainLanguage(cron)` | Converts cron to human-readable string |
| `getNextRunTimes(cron, count)` | Computes next N run times from cron |
| `isEditableStatus(status)` | Returns true only for DRAFT (inline name editing) |

### Workflow Types

```typescript
interface WorkflowSummary {
  workflowId: string;
  name: string;
  status: string;
  environmentId: string;
  recipeId?: string;
  recipeName?: string;
  lastRunAt?: string;
}

interface WorkflowDetail extends WorkflowSummary {
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastPublishedAt?: string;
  currentVersionId?: string;
  connectionIds: string[];
  triggerType?: 'webhook' | 'scheduled';
  triggerConfig?: Record<string, unknown>;
  currentVersionSummary?: { stepNames: string[] };
  compiledPlan?: StepDefinition[];
  connections?: ConnectionSummary[];
}

interface StepDefinition {
  stepId: string;
  name: string;
  type: string;
  params: Record<string, unknown>;
}

interface ConnectionSummary {
  connectionId: string;
  name: string;
  connectorType: string;
  status: string;
}

interface VersionRecord {
  versionId: string;
  semver: string;
  createdBy: string;
  createdAt: string;
  recipeId: string;
}
```

## Data Models

### API Response Shapes

**List workflows** (`GET /api/environments/{envId}/workflows`):
```json
{
  "workflows": [
    {
      "workflowId": "uuid",
      "name": "My Workflow",
      "status": "PUBLISHED",
      "environmentId": "dev",
      "recipeId": "recipe-1",
      "recipeName": "Stripe Sync",
      "lastRunAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

**Get workflow detail** (`GET /api/workflows/{workflowId}`):
```json
{
  "workflowId": "uuid",
  "name": "My Workflow",
  "status": "PUBLISHED",
  "environmentId": "dev",
  "createdBy": "user@example.com",
  "createdAt": "2024-01-10T08:00:00Z",
  "updatedAt": "2024-01-15T10:30:00Z",
  "lastPublishedAt": "2024-01-15T10:30:00Z",
  "currentVersionId": "version-uuid",
  "connectionIds": ["conn-1", "conn-2"],
  "triggerType": "scheduled",
  "triggerConfig": { "cron": "0 9 * * 1" },
  "compiledPlan": [...],
  "connections": [
    { "connectionId": "conn-1", "name": "Stripe", "connectorType": "stripe", "status": "active" }
  ],
  "currentVersionSummary": { "stepNames": ["Fetch records", "Transform data", "Upload to LMS"] }
}
```

**List versions** (`GET /api/workflows/{workflowId}/versions`):
```json
{
  "versions": [
    {
      "versionId": "uuid",
      "semver": "0.2.0",
      "createdBy": "user@example.com",
      "createdAt": "2024-01-15T10:30:00Z",
      "recipeId": "recipe-1"
    }
  ]
}
```

### Client-Side State

The list page manages:
- `workflows: WorkflowSummary[]` — fetched from API
- `statusFilter: string` — 'All' | 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'ARCHIVED'
- `loading: boolean`, `error: string | null`
- `activeModal: { type: ModalType; workflowId: string } | null`

The detail page manages:
- `workflow: WorkflowDetail | null` — fetched from API
- `versions: VersionRecord[]` — fetched on Version History tab mount
- `activeTab: 'configuration' | 'trigger' | 'connections' | 'versions'`
- `activeModal: { type: ModalType } | null`

