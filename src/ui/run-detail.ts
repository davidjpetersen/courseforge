import type { Run, RunStep } from '../../packages/types/src/runs.js';
import { RunStatus } from '../../packages/types/src/events.js';

export interface RunDetailState {
  run: Run | null;
  steps: RunStep[];
  isLoading: boolean;
  isPolling: boolean;
}

export const ERROR_CODE_MAP: Record<string, string> = {
  CONNECTOR_TIMEOUT: 'The external service did not respond within the allowed time. This is usually transient — try replaying.',
  AUTH_EXPIRED: 'The connection credentials have expired. Rotate the credentials in the Connections page.',
  RATE_LIMITED: 'The external service rejected the request due to rate limiting. Wait a few minutes and replay.',
  SCHEMA_MISMATCH: 'The data returned by the external service did not match the expected format. Check the connector configuration.',
};

export function createRunDetailState(): RunDetailState {
  return {
    run: null,
    steps: [],
    isLoading: false,
    isPolling: false,
  };
}

export function getErrorExplanation(errorCode: string): string {
  return ERROR_CODE_MAP[errorCode] ?? 'This error code is not yet documented. Contact support if the issue persists.';
}

export function isTerminalStatus(status: RunStatus): boolean {
  return status === RunStatus.SUCCESS || status === RunStatus.FAILED;
}

export function shouldPollDetail(run: Run | null): boolean {
  return run !== null && run.status === RunStatus.RUNNING;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  if (seconds === 0) {
    return `${minutes}m`;
  }
  return `${minutes}m ${seconds}s`;
}

export function buildReplayBadgeText(parentRunId: string): string {
  return `Replay of run #${parentRunId}`;
}
