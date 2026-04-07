import type { Run } from '../../packages/types/src/runs.js';
import { RunStatus } from '../../packages/types/src/events.js';

export interface RunFilters {
  workflowId?: string;
  statuses: RunStatus[];
  dateFrom?: string;
  dateTo?: string;
}

export interface RunListState {
  runs: Run[];
  filters: RunFilters;
  nextCursor?: string;
  isLoading: boolean;
  isPolling: boolean;
}

export function createRunListState(): RunListState {
  return {
    runs: [],
    filters: { statuses: [] },
    nextCursor: undefined,
    isLoading: false,
    isPolling: false,
  };
}

export function applyFilters(state: RunListState, filters: RunFilters): RunListState {
  return { ...state, filters };
}

export function appendPage(state: RunListState, runs: Run[], nextCursor?: string): RunListState {
  return { ...state, runs: [...state.runs, ...runs], nextCursor };
}

export function sortFailedFirst(runs: Run[]): Run[] {
  const failed: Run[] = [];
  const rest: Run[] = [];
  for (const run of runs) {
    if (run.status === RunStatus.FAILED) {
      failed.push(run);
    } else {
      rest.push(run);
    }
  }
  return [...failed, ...rest];
}

export function shouldPoll(runs: Run[]): boolean {
  return runs.some(r => r.status === RunStatus.RUNNING || r.status === RunStatus.PENDING);
}

export function buildEmptyStateMessage(): string {
  return 'No runs yet. Publish a workflow to see executions here.';
}
