'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { Run, RunStep } from '../../../../packages/types/src/runs';
import { maskSensitiveFields } from '../../../lib/mask-sensitive';

const ERROR_LOOKUP: Record<string, string> = {
  AUTH_INVALID: 'Authentication credentials are invalid or expired.',
  RATE_LIMITED: 'The provider rate limit was exceeded. Retry later.',
  TIMEOUT: 'The step timed out before receiving a response.',
  D2L_401: 'The target LMS rejected the request. Reconnect the integration or verify the credentials.',
  SLACK_CHANNEL_NOT_FOUND: 'The configured destination channel no longer exists or is not accessible.',
};
const UNKNOWN_ERROR_MESSAGE =
  'This error code is not yet documented. Contact support if the issue persists.';
const STATUS_CLASS: Record<Run['status'], string> = {
  SUCCESS: 'bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200',
  FAILED: 'bg-rose-100 text-rose-800 ring-1 ring-inset ring-rose-200',
  RUNNING: 'animate-pulse bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200',
  PENDING: 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200',
  REPLAYING: 'bg-sky-100 text-sky-800 ring-1 ring-inset ring-sky-200',
};

function formatDuration(durationMs?: number): string {
  if (typeof durationMs !== 'number') {
    return '—';
  }

  if (durationMs < 1_000) {
    return `${durationMs} ms`;
  }

  const totalSeconds = Math.round(durationMs / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) {
    return `${totalSeconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

function connectorGlyph(connectorKey: string): string {
  if (/slack/i.test(connectorKey)) return '💬';
  if (/http|webhook/i.test(connectorKey)) return '🌐';
  if (/canvas|oneroster|lti|brightspace/i.test(connectorKey)) return '🎓';
  return '🔗';
}

function maskSummary(summary: string): string {
  try {
    return JSON.stringify(maskSensitiveFields(JSON.parse(summary)), null, 2);
  } catch {
    return summary;
  }
}

export default function RunDetailPage({ params }: { params: { runId: string } }) {
  const [run, setRun] = useState<Run | null>(null);
  const [steps, setSteps] = useState<RunStep[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [replaying, setReplaying] = useState(false);
  const intervalRef = useRef<number | null>(null);

  const isRunning = useMemo(
    () => run?.status === 'RUNNING' || run?.status === 'PENDING' || run?.status === 'REPLAYING',
    [run],
  );

  async function fetchDetail() {
    const res = await fetch(`/api/runs/${params.runId}`);
    if (res.status === 404) {
      setNotFound(true);
      return;
    }

    const data = (await res.json()) as { run: Run; steps: RunStep[] };
    setRun(data.run);
    setSteps(data.steps);
  }

  useEffect(() => {
    void fetchDetail();
  }, [params.runId]);

  useEffect(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!isRunning) return;
    intervalRef.current = window.setInterval(() => void fetchDetail(), 5_000);
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning]);

  async function replayRun() {
    setReplaying(true);
    setToast(null);

    try {
      const response = await fetch(`/api/runs/${params.runId}/replay`, { method: 'POST' });
      const data = (await response.json()) as { newRunId?: string; message?: string };
      if (!response.ok || !data.newRunId) {
        throw new Error(data.message ?? 'Replay failed');
      }

      setToast({ kind: 'success', message: 'Replay started. Redirecting to the new run…' });
      window.setTimeout(() => {
        window.location.assign(`/runs/${data.newRunId}`);
      }, 600);
    } catch (error) {
      setToast({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Replay failed',
      });
    } finally {
      setReplaying(false);
    }
  }

  if (notFound) {
    return <div className="p-6 text-sm text-slate-600">404 | Run not found.</div>;
  }

  if (!run) {
    return <div className="p-6 text-sm text-slate-600">Loading run details…</div>;
  }

  return (
    <main className="min-h-screen space-y-6 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.12),_transparent_35%),linear-gradient(180deg,_#fff7ed_0%,_#f8fafc_100%)] p-6">
      <nav className="text-sm text-slate-600">
        <Link href={`/workflows/${run.workflowId}`} className="font-medium text-sky-700 hover:underline">
          Back to workflow
        </Link>
      </nav>

      {toast ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm shadow-sm ${
            toast.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {toast.message}
        </div>
      ) : null}

      <section className="rounded-3xl border border-white/70 bg-white/95 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{run.workflowName}</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[run.status]}`}>
                {run.status}
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 capitalize">
                {run.triggerType}
              </span>
              {run.parentRunId ? (
                <Link
                  href={`/runs/${run.parentRunId}`}
                  className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-800"
                >
                  Replay of run #{run.parentRunId}
                </Link>
              ) : null}
            </div>
          </div>

          <dl className="grid gap-x-8 gap-y-3 text-sm text-slate-600 sm:grid-cols-2">
            <div>
              <dt className="font-medium text-slate-900">Started</dt>
              <dd>{new Date(run.startedAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-900">Duration</dt>
              <dd>{formatDuration(run.durationMs)}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-900">Version</dt>
              <dd>{run.versionId}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-900">Run ID</dt>
              <dd className="font-mono text-xs">{run.runId}</dd>
            </div>
          </dl>
        </div>
      </section>

      {run.status === 'FAILED' ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900 md:flex-row md:items-center md:justify-between">
          <p className="text-sm font-medium">
            This run failed. Inspect the step timeline below, then replay it once the underlying issue is resolved.
          </p>
          <button
            className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
            disabled={replaying}
            onClick={() => void replayRun()}
          >
            Replay this run
          </button>
        </section>
      ) : null}

      <section className="space-y-4">
        {steps.map((step) => (
          <article key={step.stepId} className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="absolute bottom-0 left-6 top-0 w-px bg-slate-200" aria-hidden="true" />
            <header className="relative z-10 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-lg">
                    {connectorGlyph(step.connectorKey)}
                  </span>
                  <span>
                    {step.stepIndex}. {step.label}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                    {step.connectorKey}
                  </span>
                </h2>
                <p className="text-sm text-slate-600">
                  {new Date(step.startedAt).toLocaleString()} · {formatDuration(
                    step.endedAt
                      ? new Date(step.endedAt).getTime() - new Date(step.startedAt).getTime()
                      : undefined,
                  )}
                </p>
              </div>
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[step.status]}`}>
                {step.status}
              </span>
            </header>

            <div className="relative z-10 mt-4 space-y-3">
              <details className="rounded-xl bg-slate-50 p-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-800">Input summary</summary>
                <pre className="mt-3 overflow-auto whitespace-pre-wrap text-xs text-slate-700">{maskSummary(step.inputSummary)}</pre>
              </details>

              <details className="rounded-xl bg-slate-50 p-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-800">
                  {step.errorMessage ? 'Error details' : 'Output summary'}
                </summary>
                <pre className="mt-3 overflow-auto whitespace-pre-wrap text-xs text-slate-700">
                  {step.errorMessage ?? maskSummary(step.outputSummary)}
                </pre>
              </details>
            </div>

            {step.errorCode ? (
              <div className="relative z-10 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                <p className="font-medium">
                  {step.errorCode}: {step.errorMessage}
                </p>
                <span
                  className="mt-2 inline-flex cursor-help rounded-full bg-white px-2 py-1 text-xs font-semibold text-rose-700"
                  title={ERROR_LOOKUP[step.errorCode] ?? UNKNOWN_ERROR_MESSAGE}
                >
                  What does this mean?
                </span>
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </main>
  );
}
