import { describe, expect, it } from 'vitest';
import { RunStatus } from '../../packages/types/src/events.js';
import type { Run } from '../../packages/types/src/runs.js';
import {
  createRunDetailState,
  ERROR_CODE_MAP,
  getErrorExplanation,
  isTerminalStatus,
  shouldPollDetail,
  formatDuration,
  buildReplayBadgeText,
} from './run-detail.js';

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

describe('createRunDetailState', () => {
  it('returns default state', () => {
    const state = createRunDetailState();
    expect(state).toEqual({
      run: null,
      steps: [],
      isLoading: false,
      isPolling: false,
    });
  });
});

describe('getErrorExplanation', () => {
  it('returns explanation for CONNECTOR_TIMEOUT', () => {
    expect(getErrorExplanation('CONNECTOR_TIMEOUT')).toBe(
      ERROR_CODE_MAP['CONNECTOR_TIMEOUT'],
    );
  });

  it('returns explanation for AUTH_EXPIRED', () => {
    expect(getErrorExplanation('AUTH_EXPIRED')).toBe(
      ERROR_CODE_MAP['AUTH_EXPIRED'],
    );
  });

  it('returns explanation for RATE_LIMITED', () => {
    expect(getErrorExplanation('RATE_LIMITED')).toBe(
      ERROR_CODE_MAP['RATE_LIMITED'],
    );
  });

  it('returns explanation for SCHEMA_MISMATCH', () => {
    expect(getErrorExplanation('SCHEMA_MISMATCH')).toBe(
      ERROR_CODE_MAP['SCHEMA_MISMATCH'],
    );
  });

  it('returns generic fallback for unknown error code', () => {
    expect(getErrorExplanation('UNKNOWN_CODE')).toBe(
      'This error code is not yet documented. Contact support if the issue persists.',
    );
  });

  it('returns generic fallback for empty string', () => {
    expect(getErrorExplanation('')).toBe(
      'This error code is not yet documented. Contact support if the issue persists.',
    );
  });
});

describe('isTerminalStatus', () => {
  it('returns true for SUCCESS', () => {
    expect(isTerminalStatus(RunStatus.SUCCESS)).toBe(true);
  });

  it('returns true for FAILED', () => {
    expect(isTerminalStatus(RunStatus.FAILED)).toBe(true);
  });

  it('returns false for RUNNING', () => {
    expect(isTerminalStatus(RunStatus.RUNNING)).toBe(false);
  });

  it('returns false for PENDING', () => {
    expect(isTerminalStatus(RunStatus.PENDING)).toBe(false);
  });

  it('returns false for REPLAYING', () => {
    expect(isTerminalStatus(RunStatus.REPLAYING)).toBe(false);
  });
});

describe('shouldPollDetail', () => {
  it('returns true for a RUNNING run', () => {
    expect(shouldPollDetail(makeRun({ status: RunStatus.RUNNING }))).toBe(true);
  });

  it('returns false for null', () => {
    expect(shouldPollDetail(null)).toBe(false);
  });

  it('returns false for a SUCCESS run', () => {
    expect(shouldPollDetail(makeRun({ status: RunStatus.SUCCESS }))).toBe(false);
  });

  it('returns false for a FAILED run', () => {
    expect(shouldPollDetail(makeRun({ status: RunStatus.FAILED }))).toBe(false);
  });

  it('returns false for a PENDING run', () => {
    expect(shouldPollDetail(makeRun({ status: RunStatus.PENDING }))).toBe(false);
  });

  it('returns false for a REPLAYING run', () => {
    expect(shouldPollDetail(makeRun({ status: RunStatus.REPLAYING }))).toBe(false);
  });
});

describe('formatDuration', () => {
  it('returns "0ms" for zero', () => {
    expect(formatDuration(0)).toBe('0ms');
  });

  it('returns milliseconds for sub-second values', () => {
    expect(formatDuration(450)).toBe('450ms');
  });

  it('returns seconds with one decimal for exactly 1s', () => {
    expect(formatDuration(1000)).toBe('1.0s');
  });

  it('returns seconds with one decimal for values under 60s', () => {
    expect(formatDuration(1200)).toBe('1.2s');
  });

  it('returns minutes and seconds for values >= 60s', () => {
    expect(formatDuration(150_000)).toBe('2m 30s');
  });

  it('returns minutes only when seconds remainder is zero', () => {
    expect(formatDuration(120_000)).toBe('2m');
  });

  it('returns "1m 1s" for 61 seconds', () => {
    expect(formatDuration(61_000)).toBe('1m 1s');
  });
});

describe('buildReplayBadgeText', () => {
  it('returns formatted replay badge text', () => {
    expect(buildReplayBadgeText('abc-123')).toBe('Replay of run #abc-123');
  });

  it('works with numeric-style IDs', () => {
    expect(buildReplayBadgeText('42')).toBe('Replay of run #42');
  });
});
