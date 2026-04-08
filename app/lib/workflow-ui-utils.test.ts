import { describe, it, expect } from 'vitest';
import {
  getStatusBadgeClasses,
  filterWorkflowsByStatus,
  getAvailableActions,
  getSidebarActions,
  isEditableStatus,
  buildPublishChecklist,
  type WorkflowSummary,
  type WorkflowDetail,
} from './workflow-ui-utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWorkflow(overrides: Partial<WorkflowSummary> = {}): WorkflowSummary {
  return {
    workflowId: 'wf-1',
    name: 'Test Workflow',
    status: 'DRAFT',
    environmentId: 'dev',
    ...overrides,
  };
}

function makeWorkflowDetail(overrides: Partial<WorkflowDetail> = {}): WorkflowDetail {
  return {
    workflowId: 'wf-1',
    name: 'Test Workflow',
    status: 'DRAFT',
    environmentId: 'dev',
    createdBy: 'user@example.com',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    connectionIds: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getStatusBadgeClasses
// ---------------------------------------------------------------------------
describe('getStatusBadgeClasses', () => {
  it('returns slate classes for DRAFT', () => {
    const classes = getStatusBadgeClasses('DRAFT');
    expect(classes).toContain('slate');
  });

  it('returns emerald classes for PUBLISHED', () => {
    const classes = getStatusBadgeClasses('PUBLISHED');
    expect(classes).toContain('emerald');
  });

  it('returns amber classes for PAUSED', () => {
    const classes = getStatusBadgeClasses('PAUSED');
    expect(classes).toContain('amber');
  });

  it('returns rose classes for ARCHIVED', () => {
    const classes = getStatusBadgeClasses('ARCHIVED');
    expect(classes).toContain('rose');
  });

  it('returns slate fallback for unknown status', () => {
    const classes = getStatusBadgeClasses('UNKNOWN');
    expect(classes).toContain('slate');
  });
});

// ---------------------------------------------------------------------------
// filterWorkflowsByStatus
// ---------------------------------------------------------------------------
describe('filterWorkflowsByStatus', () => {
  const workflows: WorkflowSummary[] = [
    makeWorkflow({ workflowId: 'wf-1', status: 'DRAFT' }),
    makeWorkflow({ workflowId: 'wf-2', status: 'PUBLISHED' }),
    makeWorkflow({ workflowId: 'wf-3', status: 'PAUSED' }),
    makeWorkflow({ workflowId: 'wf-4', status: 'ARCHIVED' }),
  ];

  it('returns all workflows when status is "All"', () => {
    expect(filterWorkflowsByStatus(workflows, 'All')).toEqual(workflows);
  });

  it('filters to DRAFT only', () => {
    const result = filterWorkflowsByStatus(workflows, 'DRAFT');
    expect(result).toHaveLength(1);
    expect(result[0].workflowId).toBe('wf-1');
  });

  it('filters to PUBLISHED only', () => {
    const result = filterWorkflowsByStatus(workflows, 'PUBLISHED');
    expect(result).toHaveLength(1);
    expect(result[0].workflowId).toBe('wf-2');
  });

  it('filters to PAUSED only', () => {
    const result = filterWorkflowsByStatus(workflows, 'PAUSED');
    expect(result).toHaveLength(1);
    expect(result[0].workflowId).toBe('wf-3');
  });

  it('filters to ARCHIVED only', () => {
    const result = filterWorkflowsByStatus(workflows, 'ARCHIVED');
    expect(result).toHaveLength(1);
    expect(result[0].workflowId).toBe('wf-4');
  });

  it('returns empty array when no workflows match', () => {
    expect(filterWorkflowsByStatus(workflows, 'NONEXISTENT')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getAvailableActions
// ---------------------------------------------------------------------------
describe('getAvailableActions', () => {
  it('includes promote when environment is dev', () => {
    const actions = getAvailableActions('PUBLISHED', 'dev');
    expect(actions).toContain('promote');
  });

  it('excludes promote when environment is prod', () => {
    const actions = getAvailableActions('PUBLISHED', 'prod');
    expect(actions).not.toContain('promote');
  });

  it('always includes publish, pause, archive, view-runs', () => {
    const actions = getAvailableActions('DRAFT', 'prod');
    expect(actions).toContain('publish');
    expect(actions).toContain('pause');
    expect(actions).toContain('archive');
    expect(actions).toContain('view-runs');
  });
});

// ---------------------------------------------------------------------------
// getSidebarActions
// ---------------------------------------------------------------------------
describe('getSidebarActions', () => {
  it('returns ["publish"] for DRAFT', () => {
    expect(getSidebarActions('DRAFT', 'dev')).toEqual(['publish']);
    expect(getSidebarActions('DRAFT', 'prod')).toEqual(['publish']);
  });

  it('returns ["pause","archive"] for PUBLISHED in prod', () => {
    expect(getSidebarActions('PUBLISHED', 'prod')).toEqual(['pause', 'archive']);
  });

  it('returns ["pause","archive","promote"] for PUBLISHED in dev', () => {
    expect(getSidebarActions('PUBLISHED', 'dev')).toEqual(['pause', 'archive', 'promote']);
  });

  it('returns ["publish","archive"] for PAUSED', () => {
    expect(getSidebarActions('PAUSED', 'dev')).toEqual(['publish', 'archive']);
    expect(getSidebarActions('PAUSED', 'prod')).toEqual(['publish', 'archive']);
  });

  it('returns [] for ARCHIVED', () => {
    expect(getSidebarActions('ARCHIVED', 'dev')).toEqual([]);
    expect(getSidebarActions('ARCHIVED', 'prod')).toEqual([]);
  });

  it('returns [] for unknown status', () => {
    expect(getSidebarActions('UNKNOWN', 'dev')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// isEditableStatus
// ---------------------------------------------------------------------------
describe('isEditableStatus', () => {
  it('returns true for DRAFT', () => {
    expect(isEditableStatus('DRAFT')).toBe(true);
  });

  it('returns false for PUBLISHED', () => {
    expect(isEditableStatus('PUBLISHED')).toBe(false);
  });

  it('returns false for PAUSED', () => {
    expect(isEditableStatus('PAUSED')).toBe(false);
  });

  it('returns false for ARCHIVED', () => {
    expect(isEditableStatus('ARCHIVED')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildPublishChecklist
// ---------------------------------------------------------------------------
describe('buildPublishChecklist', () => {
  it('returns all-passing checklist when conditions are met', () => {
    const workflow = makeWorkflowDetail({
      connections: [
        { connectionId: 'c1', name: 'Stripe', connectorType: 'stripe', status: 'active' },
      ],
      triggerType: 'webhook',
      triggerConfig: { url: 'https://example.com/hook' },
      compiledPlan: [
        { stepId: 's1', name: 'Step 1', type: 'action', params: {} },
      ],
    });

    const items = buildPublishChecklist(workflow);
    expect(items).toHaveLength(3);
    expect(items.every((i) => i.passed)).toBe(true);
  });

  it('fails connections check when no connections exist', () => {
    const workflow = makeWorkflowDetail({
      connections: [],
      triggerType: 'webhook',
      triggerConfig: { url: 'https://example.com/hook' },
      compiledPlan: [{ stepId: 's1', name: 'Step 1', type: 'action', params: {} }],
    });

    const items = buildPublishChecklist(workflow);
    const connItem = items.find((i) => i.label === 'All connections active');
    expect(connItem?.passed).toBe(false);
  });

  it('fails connections check when a connection is not active', () => {
    const workflow = makeWorkflowDetail({
      connections: [
        { connectionId: 'c1', name: 'Stripe', connectorType: 'stripe', status: 'error' },
      ],
      triggerType: 'webhook',
      triggerConfig: { url: 'https://example.com/hook' },
      compiledPlan: [{ stepId: 's1', name: 'Step 1', type: 'action', params: {} }],
    });

    const items = buildPublishChecklist(workflow);
    const connItem = items.find((i) => i.label === 'All connections active');
    expect(connItem?.passed).toBe(false);
  });

  it('fails trigger check when triggerType is missing', () => {
    const workflow = makeWorkflowDetail({
      connections: [
        { connectionId: 'c1', name: 'Stripe', connectorType: 'stripe', status: 'active' },
      ],
      compiledPlan: [{ stepId: 's1', name: 'Step 1', type: 'action', params: {} }],
    });

    const items = buildPublishChecklist(workflow);
    const triggerItem = items.find((i) => i.label === 'Trigger configured');
    expect(triggerItem?.passed).toBe(false);
  });

  it('fails trigger check when triggerConfig is empty', () => {
    const workflow = makeWorkflowDetail({
      connections: [
        { connectionId: 'c1', name: 'Stripe', connectorType: 'stripe', status: 'active' },
      ],
      triggerType: 'scheduled',
      triggerConfig: {},
      compiledPlan: [{ stepId: 's1', name: 'Step 1', type: 'action', params: {} }],
    });

    const items = buildPublishChecklist(workflow);
    const triggerItem = items.find((i) => i.label === 'Trigger configured');
    expect(triggerItem?.passed).toBe(false);
  });

  it('fails steps check when no compiled plan or version summary', () => {
    const workflow = makeWorkflowDetail({
      connections: [
        { connectionId: 'c1', name: 'Stripe', connectorType: 'stripe', status: 'active' },
      ],
      triggerType: 'webhook',
      triggerConfig: { url: 'https://example.com/hook' },
    });

    const items = buildPublishChecklist(workflow);
    const stepsItem = items.find((i) => i.label === 'At least one step present');
    expect(stepsItem?.passed).toBe(false);
  });

  it('passes steps check via currentVersionSummary when compiledPlan is absent', () => {
    const workflow = makeWorkflowDetail({
      connections: [
        { connectionId: 'c1', name: 'Stripe', connectorType: 'stripe', status: 'active' },
      ],
      triggerType: 'webhook',
      triggerConfig: { url: 'https://example.com/hook' },
      currentVersionSummary: { stepNames: ['Fetch records'] },
    });

    const items = buildPublishChecklist(workflow);
    const stepsItem = items.find((i) => i.label === 'At least one step present');
    expect(stepsItem?.passed).toBe(true);
  });
});
