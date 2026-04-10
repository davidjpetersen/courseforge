import { describe, it, expect } from 'vitest';
import { WorkflowStatus, RunStatus } from './events';
import {
  WorkflowStatus as IndexWorkflowStatus,
  RunStatus as IndexRunStatus,
  DomainEvent,
} from './index';

describe('WorkflowStatus enum', () => {
  it('has exactly DRAFT, PUBLISHED, PAUSED, ARCHIVED values', () => {
    const values = Object.values(WorkflowStatus);
    expect(values).toEqual(['DRAFT', 'PUBLISHED', 'PAUSED', 'ARCHIVED']);
    expect(values).toHaveLength(4);
  });

  it('maps each key to its string value', () => {
    expect(WorkflowStatus.DRAFT).toBe('DRAFT');
    expect(WorkflowStatus.PUBLISHED).toBe('PUBLISHED');
    expect(WorkflowStatus.PAUSED).toBe('PAUSED');
    expect(WorkflowStatus.ARCHIVED).toBe('ARCHIVED');
  });
});

describe('RunStatus enum', () => {
  it('has exactly PENDING, RUNNING, SUCCESS, FAILED, REPLAYING values', () => {
    const values = Object.values(RunStatus);
    expect(values).toEqual(['PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'REPLAYING']);
    expect(values).toHaveLength(5);
  });

  it('maps each key to its string value', () => {
    expect(RunStatus.PENDING).toBe('PENDING');
    expect(RunStatus.RUNNING).toBe('RUNNING');
    expect(RunStatus.SUCCESS).toBe('SUCCESS');
    expect(RunStatus.FAILED).toBe('FAILED');
    expect(RunStatus.REPLAYING).toBe('REPLAYING');
  });
});

describe('index.ts re-exports', () => {
  it('re-exports WorkflowStatus from index', () => {
    expect(IndexWorkflowStatus).toBe(WorkflowStatus);
  });

  it('re-exports RunStatus from index', () => {
    expect(IndexRunStatus).toBe(RunStatus);
  });

  it('DomainEvent type is usable from index', () => {
    const event: DomainEvent = {
      tenantId: 'tenant-1',
      workflowId: 'wf-1',
      eventType: 'test.event',
      payload: { key: 'value' },
      traceId: 'trace-1',
      timestamp: new Date().toISOString(),
    };
    expect(event.tenantId).toBe('tenant-1');
    expect(event.workflowId).toBe('wf-1');
  });
});
