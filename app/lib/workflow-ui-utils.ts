// Pure UI logic for workflow management pages
// Extracted for testability — no React dependencies

export type WorkflowStatus = 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'ARCHIVED';
export type ContextMenuAction = 'publish' | 'pause' | 'archive' | 'view-runs' | 'promote';
export type SidebarAction = 'publish' | 'pause' | 'archive' | 'promote';

export interface ChecklistItem {
  label: string;
  passed: boolean;
}

export interface VersionRecord {
  versionId: string;
  semver: string;
  createdBy: string;
  createdAt: string;
  recipeId: string;
}

export interface WorkflowSummary {
  workflowId: string;
  name: string;
  status: string;
  environmentId: string;
  recipeId?: string;
  recipeName?: string;
  lastRunAt?: string;
}

// ---------------------------------------------------------------------------
// Status badge classes
// ---------------------------------------------------------------------------

const STATUS_BADGE_CLASSES: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200',
  PUBLISHED: 'bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200',
  PAUSED: 'bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200',
  ARCHIVED: 'bg-rose-100 text-rose-800 ring-1 ring-inset ring-rose-200',
};

const FALLBACK_BADGE_CLASSES = 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200';

/**
 * Returns Tailwind classes for a workflow status badge.
 * Unknown statuses fall back to slate.
 */
export function getStatusBadgeClasses(status: string): string {
  return STATUS_BADGE_CLASSES[status] ?? FALLBACK_BADGE_CLASSES;
}

// ---------------------------------------------------------------------------
// Workflow filtering
// ---------------------------------------------------------------------------

/**
 * Filters workflows by status. Returns all workflows when status is 'All'.
 */
export function filterWorkflowsByStatus(
  workflows: WorkflowSummary[],
  status: string,
): WorkflowSummary[] {
  if (status === 'All') return workflows;
  return workflows.filter((wf) => wf.status === status);
}

// ---------------------------------------------------------------------------
// Context menu actions
// ---------------------------------------------------------------------------

/**
 * Returns the context menu actions available for a workflow row.
 * "promote" is only included when environmentId is 'dev'.
 */
export function getAvailableActions(
  status: string,
  environmentId: string,
): ContextMenuAction[] {
  const actions: ContextMenuAction[] = ['publish', 'pause', 'archive', 'view-runs'];
  if (environmentId === 'dev') {
    actions.push('promote');
  }
  return actions;
}

// ---------------------------------------------------------------------------
// Sidebar actions
// ---------------------------------------------------------------------------

/**
 * Returns the sidebar action buttons for the workflow detail page
 * based on the current status and environment.
 */
export function getSidebarActions(
  status: string,
  environmentId: string,
): SidebarAction[] {
  switch (status) {
    case 'DRAFT':
      return ['publish'];
    case 'PUBLISHED': {
      const actions: SidebarAction[] = ['pause', 'archive'];
      if (environmentId === 'dev') {
        actions.push('promote');
      }
      return actions;
    }
    case 'PAUSED':
      return ['publish', 'archive'];
    case 'ARCHIVED':
      return [];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Editable status check
// ---------------------------------------------------------------------------

/**
 * Returns true only when the workflow status is DRAFT (inline name editing).
 */
export function isEditableStatus(status: string): boolean {
  return status === 'DRAFT';
}

// ---------------------------------------------------------------------------
// Workflow detail types
// ---------------------------------------------------------------------------

export interface StepDefinition {
  stepId: string;
  name: string;
  type: string;
  params: Record<string, unknown>;
}

export interface ConnectionSummary {
  connectionId: string;
  name: string;
  connectorType: string;
  status: string;
}

export interface WorkflowDetail extends WorkflowSummary {
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

// ---------------------------------------------------------------------------
// Publish checklist builder
// ---------------------------------------------------------------------------

/**
 * Builds a pre-flight checklist for publishing a workflow.
 * Checks: all connections active, trigger configured, at least one step present.
 */
export function buildPublishChecklist(workflow: WorkflowDetail): ChecklistItem[] {
  const connections = workflow.connections ?? [];
  const allConnectionsActive =
    connections.length > 0 && connections.every((c) => c.status === 'active');

  const triggerConfigured =
    workflow.triggerType != null &&
    workflow.triggerConfig != null &&
    Object.keys(workflow.triggerConfig).length > 0;

  const hasSteps =
    (workflow.compiledPlan != null && workflow.compiledPlan.length > 0) ||
    (workflow.currentVersionSummary?.stepNames != null &&
      workflow.currentVersionSummary.stepNames.length > 0);

  return [
    { label: 'All connections active', passed: allConnectionsActive },
    { label: 'Trigger configured', passed: triggerConfigured },
    { label: 'At least one step present', passed: hasSteps },
  ];
}

// ---------------------------------------------------------------------------
// Cron expression utilities
// ---------------------------------------------------------------------------

const CRON_FIELD_REGEX = /^[\d*,/\-]+$/;

interface CronFieldDef {
  name: string;
  min: number;
  max: number;
}

const CRON_FIELDS: CronFieldDef[] = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day of month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'day of week', min: 0, max: 7 },
];

function validateCronField(value: string, field: CronFieldDef): string | null {
  if (value === '*') return null;

  // Handle step values like */5 or 1-10/2
  if (value.includes('/')) {
    const [range, stepStr] = value.split('/');
    const step = Number(stepStr);
    if (!Number.isInteger(step) || step < 1) {
      return `Invalid step value "${stepStr}" in ${field.name}`;
    }
    if (range !== '*') {
      const rangeErr = validateCronField(range, field);
      if (rangeErr) return rangeErr;
    }
    return null;
  }

  // Handle lists like 1,3,5
  if (value.includes(',')) {
    for (const part of value.split(',')) {
      const err = validateCronField(part, field);
      if (err) return err;
    }
    return null;
  }

  // Handle ranges like 1-5
  if (value.includes('-')) {
    const [startStr, endStr] = value.split('-');
    const start = Number(startStr);
    const end = Number(endStr);
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      return `Invalid range "${value}" in ${field.name}`;
    }
    if (start < field.min || start > field.max || end < field.min || end > field.max) {
      return `Value out of range in ${field.name} (${field.min}-${field.max})`;
    }
    if (start > end) {
      return `Invalid range "${value}" in ${field.name}: start > end`;
    }
    return null;
  }

  // Single number
  const num = Number(value);
  if (!Number.isInteger(num) || num < field.min || num > field.max) {
    return `Invalid value "${value}" in ${field.name} (${field.min}-${field.max})`;
  }
  return null;
}

/**
 * Validates a 5-field cron expression.
 * Returns { valid: true } or { valid: false, error: string }.
 */
export function parseCronExpression(cron: string): { valid: boolean; error?: string } {
  if (typeof cron !== 'string' || cron.trim() === '') {
    return { valid: false, error: 'Cron expression must be a non-empty string' };
  }

  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) {
    return { valid: false, error: `Expected 5 fields, got ${fields.length}` };
  }

  for (let i = 0; i < 5; i++) {
    if (!CRON_FIELD_REGEX.test(fields[i])) {
      return { valid: false, error: `Invalid characters in ${CRON_FIELDS[i].name} field` };
    }
    const err = validateCronField(fields[i], CRON_FIELDS[i]);
    if (err) {
      return { valid: false, error: err };
    }
  }

  return { valid: true };
}

/**
 * Checks whether a cron expression runs more frequently than the given
 * minimum interval in minutes. Returns true if the interval is at or above
 * the minimum, false if it runs too frequently.
 */
export function isMinimumInterval(cron: string, minMinutes: number): boolean {
  const parsed = parseCronExpression(cron);
  if (!parsed.valid) return false;

  const fields = cron.trim().split(/\s+/);
  const [minuteField, hourField, dayField, monthField, weekdayField] = fields;

  // If day-of-month, month, or day-of-week are restricted, the interval is
  // certainly >= 15 minutes (runs at most once per day).
  if (dayField !== '*' || monthField !== '*' || weekdayField !== '*') {
    return true;
  }

  // Expand the effective minute values for the minute field
  const minuteValues = expandField(minuteField, 0, 59);
  const hourValues = expandField(hourField, 0, 23);

  // Build sorted list of all (hour * 60 + minute) offsets in a day
  const offsets: number[] = [];
  for (const h of hourValues) {
    for (const m of minuteValues) {
      offsets.push(h * 60 + m);
    }
  }
  offsets.sort((a, b) => a - b);

  if (offsets.length <= 1) return true;

  // Check minimum gap between consecutive runs (including wrap-around midnight)
  let minGap = 24 * 60 - offsets[offsets.length - 1] + offsets[0]; // wrap
  for (let i = 1; i < offsets.length; i++) {
    const gap = offsets[i] - offsets[i - 1];
    if (gap < minGap) minGap = gap;
  }

  return minGap >= minMinutes;
}

/**
 * Expands a single cron field into the set of matching integer values.
 */
function expandField(field: string, min: number, max: number): number[] {
  if (field === '*') {
    return Array.from({ length: max - min + 1 }, (_, i) => min + i);
  }

  const values = new Set<number>();

  for (const part of field.split(',')) {
    if (part.includes('/')) {
      const [range, stepStr] = part.split('/');
      const step = Number(stepStr);
      let start = min;
      let end = max;
      if (range !== '*') {
        if (range.includes('-')) {
          [start, end] = range.split('-').map(Number);
        } else {
          start = Number(range);
        }
      }
      for (let v = start; v <= end; v += step) {
        values.add(v);
      }
    } else if (part.includes('-')) {
      const [s, e] = part.split('-').map(Number);
      for (let v = s; v <= e; v++) {
        values.add(v);
      }
    } else {
      values.add(Number(part));
    }
  }

  return Array.from(values).sort((a, b) => a - b);
}

/**
 * Converts a 5-field cron expression to a human-readable plain-language string.
 */
export function cronToPlainLanguage(cron: string): string {
  const parsed = parseCronExpression(cron);
  if (!parsed.valid) return 'Invalid cron expression';

  const fields = cron.trim().split(/\s+/);
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // Every N minutes
  if (minute.startsWith('*/') && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const n = minute.split('/')[1];
    return `Every ${n} minutes`;
  }

  // Every N hours (at minute M)
  if (hour.startsWith('*/') && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const n = hour.split('/')[1];
    const atMin = minute === '0' ? '' : ` at minute ${minute}`;
    return `Every ${n} hours${atMin}`;
  }

  // Specific time every day
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `Daily at ${padTime(hour)}:${padTime(minute)}`;
  }

  // Specific time on specific day(s) of week
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && dayOfMonth === '*' && month === '*' && /^[\d,]+$/.test(dayOfWeek)) {
    const days = dayOfWeek.split(',').map((d) => dayNames[Number(d) % 7]).join(', ');
    return `At ${padTime(hour)}:${padTime(minute)} on ${days}`;
  }

  // Specific time on specific day of month
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && /^\d+$/.test(dayOfMonth) && month === '*' && dayOfWeek === '*') {
    return `At ${padTime(hour)}:${padTime(minute)} on day ${dayOfMonth} of every month`;
  }

  // Specific time on specific day of specific month
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && /^\d+$/.test(dayOfMonth) && /^\d+$/.test(month) && dayOfWeek === '*') {
    return `At ${padTime(hour)}:${padTime(minute)} on ${monthNames[Number(month)]} ${dayOfMonth}`;
  }

  // Every minute
  if (minute === '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 'Every minute';
  }

  // Fallback: return the raw expression with a label
  return `Cron: ${cron.trim()}`;
}

function padTime(val: string): string {
  return val.padStart(2, '0');
}

/**
 * Computes the next N dates from now that match the given cron expression.
 */
export function getNextRunTimes(cron: string, count: number): Date[] {
  const parsed = parseCronExpression(cron);
  if (!parsed.valid || count <= 0) return [];

  const fields = cron.trim().split(/\s+/);
  const minuteValues = expandField(fields[0], 0, 59);
  const hourValues = expandField(fields[1], 0, 23);
  const domValues = expandField(fields[2], 1, 31);
  const monthValues = expandField(fields[3], 1, 12);
  const dowValues = expandField(fields[4], 0, 7).map((d) => d % 7); // normalise 7→0

  const results: Date[] = [];
  const now = new Date();
  // Start from the next minute boundary
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes() + 1, 0, 0);

  // Safety limit to avoid infinite loops on very sparse schedules
  const maxIterations = 525960; // ~1 year of minutes

  for (let i = 0; i < maxIterations && results.length < count; i++) {
    const m = cursor.getMinutes();
    const h = cursor.getHours();
    const dom = cursor.getDate();
    const mon = cursor.getMonth() + 1; // JS months are 0-based
    const dow = cursor.getDay(); // 0=Sunday

    if (
      minuteValues.includes(m) &&
      hourValues.includes(h) &&
      domValues.includes(dom) &&
      monthValues.includes(mon) &&
      dowValues.includes(dow)
    ) {
      results.push(new Date(cursor));
    }

    // Advance by 1 minute
    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  return results;
}
