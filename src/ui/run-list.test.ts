import { describe, expect, it } from 'vitest';
import { RunStatus } from '../../packages/types/src/events.js';
import type { Run } from '../../packages/types/src/runs.js';
import {
  sortFailedFirst,
  shouldPoll,
  appendPage,
  buildEmptyStateMessage,
  createRunListState,
} from './run-list.js';

function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    runId: 'run-1',
    workflowId: 'wf-1',
    workflowName: 'Test Workflow',
    tenantId: 'tenant-1',
    versionId: 'v1',
    status: RunStatus.SUCCESS,
    triggerType: 'webhook',
    triggerEventId: 'evt-1',
    startedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('sortFailedFirst', () => {
  it('places FAILED runs before others', () => {
    const runs = [
      makeRun({ runId: 'r1', status: RunStatus.SUCCESS }),
      makeRun({ runId: 'r2', status: RunStatus.FAILED }),
      makeRun({ runId: 'r3', status: RunStatus.RUNNING }),
      makeRun({ runId: 'r4', status: RunStatus.FAILED }),
    ];

    const sorted = sortFailedFirst(runs);

    expect(sorted[0].runId).toBe('r2');
    expect(sorted[1].runId).toBe('r4');
    expect(sorted[2].runId).toBe('r1');
    expect(sorted[3].runId).toBe('r3');
  });

  it('preserves original order among non-FAILED runs', () => {
    const runs = [
      makeRun({ runId: 'r1', status: RunStatus.SUCCESS }),
      makeRun({ runId: 'r2', status: RunStatus.RUNNING }),
      makeRun({ runId: 'r3', status: RunStatus.PENDING }),
    ];

    const sorted = sortFailedFirst(runs);

    expect(sorted.map(r => r.runId)).toEqual(['r1', 'r2', 'r3']);
  });

  it('does not mutate the input array', () => {
    const runs = [
      makeRun({ runId: 'r1', status: RunStatus.SUCCESS }),
      makeRun({ runId: 'r2', status: RunStatus.FAILED }),
    ];
    const original = [...runs];

    sortFailedFirst(runs);

    expect(runs).toEqual(original);
  });

  it('returns empty array for empty input', () => {
    expect(sortFailedFirst([])).toEqual([]);
  });

  it('handles all FAILED runs', () => {
    const runs = [
      makeRun({ runId: 'r1', status: RunStatus.FAILED }),
      makeRun({ runId: 'r2', status: RunStatus.FAILED }),
    ];

    const sorted = sortFailedFirst(runs);

    expect(sorted.map(r => r.runId)).toEqual(['r1', 'r2']);
  });

  it('handles no FAILED runs', () => {
    const runs = [
      makeRun({ runId: 'r1', status: RunStatus.SUCCESS }),
      makeRun({ runId: 'r2', status: RunStatus.RUNNING }),
    ];

    const sorted = sortFailedFirst(runs);

    expect(sorted.map(r => r.runId)).toEqual(['r1', 'r2']);
  });
});

describe('shouldPoll', () => {
  it('returns true when any run is RUNNING', () => {
    const runs = [
      makeRun({ status: RunStatus.SUCCESS }),
      makeRun({ status: RunStatus.RUNNING }),
    ];
    expect(shouldPoll(runs)).toBe(true);
  });

  it('returns true when any run is PENDING', () => {
    const runs = [
      makeRun({ status: RunStatus.FAILED }),
      makeRun({ status: RunStatus.PENDING }),
    ];
    expect(shouldPoll(runs)).toBe(true);
  });

  it('returns false when all runs are terminal (SUCCESS/FAILED)', () => {
    const runs = [
      makeRun({ status: RunStatus.SUCCESS }),
      makeRun({ status: RunStatus.FAILED }),
    ];
    expect(shouldPoll(runs)).toBe(false);
  });

  it('returns false for empty array', () => {
    expect(shouldPoll([])).toBe(false);
  });
});

describe('appendPage', () => {
  it('appends new runs to existing runs', () => {
    const state = {
      ...createRunListState(),
      runs: [makeRun({ runId: 'r1' })],
    };
    const newRuns = [makeRun({ runId: 'r2' }), makeRun({ runId: 'r3' })];

    const updated = appendPage(state, newRuns, 'cursor-abc');

    expect(updated.runs).toHaveLength(3);
    expect(updated.runs.map(r => r.runId)).toEqual(['r1', 'r2', 'r3']);
  });

  it('updates nextCursor', () => {
    const state = createRunListState();
    const updated = appendPage(state, [makeRun()], 'next-page');

    expect(updated.nextCursor).toBe('next-page');
  });

  it('sets nextCursor to undefined when not provided', () => {
    const state = {
      ...createRunListState(),
      nextCursor: 'old-cursor',
    };

    const updated = appendPage(state, []);

    expect(updated.nextCursor).toBeUndefined();
  });
});

describe('buildEmptyStateMessage', () => {
  it('returns the correct empty state string', () => {
    expect(buildEmptyStateMessage()).toBe(
      'No runs yet. Publish a workflow to see executions here.',
    );
  });
});
