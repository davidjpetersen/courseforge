'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { Run } from '../../../packages/types/src/runs';
import { RunStatus } from '../../../packages/types/src';

const STATUS_CLASS: Record<Run['status'], string> = {
  SUCCESS: 'bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200',
  FAILED: 'bg-rose-100 text-rose-800 ring-1 ring-inset ring-rose-200',
  RUNNING: 'animate-pulse bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200',
  PENDING: 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200',
  REPLAYING: 'bg-sky-100 text-sky-800 ring-1 ring-inset ring-sky-200',
};
const STATUS_OPTIONS = Object.values(RunStatus);

function sortRuns(runs: Run[]): Run[] {
  return [...runs].sort((a, b) => {
    const aDay = a.startedAt.slice(0, 10);
    const bDay = b.startedAt.slice(0, 10);
    if (aDay !== bDay) {
      return b.startedAt.localeCompare(a.startedAt);
    }

    if (a.status === 'FAILED' && b.status !== 'FAILED') {
      return -1;
    }

    if (b.status === 'FAILED' && a.status !== 'FAILED') {
      return 1;
    }

    return b.startedAt.localeCompare(a.startedAt);
  });
}

function formatDuration(durationMs?: number): string {
  if (typeof durationMs !== 'number') {
    return '—';
  }

  if (durationMs < 1_000) {
    return `${durationMs} ms`;
  }

  const seconds = durationMs / 1_000;
  if (seconds < 60) {
    return `${seconds.toFixed(seconds >= 10 ? 0 : 1)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [workflowId, setWorkflowId] = useState('');
  const [statuses, setStatuses] = useState<Run['status'][]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const intervalRef = useRef<number | null>(null);

  const hasActiveRun = useMemo(
    () => runs.some((run) => run.status === 'RUNNING' || run.status === 'PENDING'),
    [runs],
  );
  const workflowOptions = useMemo(() => {
    const unique = new Map<string, string>();
    for (const run of runs) {
      if (!unique.has(run.workflowId)) {
        unique.set(run.workflowId, run.workflowName);
      }
    }
    return [...unique.entries()].map(([id, name]) => ({ id, name }));
  }, [runs]);

  async function load(append = false) {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (workflowId) params.set('workflowId', workflowId);
    if (statuses.length > 0) params.set('status', statuses.join(','));
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (append && cursor) params.set('cursor', cursor);

    try {
      const response = await fetch(`/api/runs?${params.toString()}`, { cache: 'no-store' });
      const data = (await response.json()) as { runs?: Run[]; nextCursor?: string; message?: string };
      if (!response.ok || !data.runs) {
        throw new Error(data.message ?? 'Unable to load runs');
      }

      setRuns((prev) => sortRuns(append ? [...prev, ...data.runs] : data.runs));
      setCursor(data.nextCursor);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load runs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(false);
  }, [workflowId, statuses, dateFrom, dateTo]);

  useEffect(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!hasActiveRun) {
      return;
    }

    intervalRef.current = window.setInterval(() => {
      void load(false);
    }, 30_000);

    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [hasActiveRun, workflowId, statuses, dateFrom, dateTo]);

  function toggleStatus(nextStatus: Run['status']) {
    setStatuses((current) =>
      current.includes(nextStatus)
        ? current.filter((value) => value !== nextStatus)
        : [...current, nextStatus],
    );
  }

  return (
    <main className="min-h-screen space-y-6 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_35%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Run history</h1>
        <p className="text-sm text-slate-600">
          Review recent workflow executions, spot failures quickly, and keep an eye on in-progress runs.
        </p>
      </div>

      <section className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm backdrop-blur">
        <div className="grid gap-4 lg:grid-cols-[minmax(16rem,1fr)_minmax(18rem,1.2fr)_auto_auto]">
          <label className="space-y-1 text-sm text-slate-700">
            <span className="font-medium">Workflow</span>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
              value={workflowId}
              onChange={(event) => setWorkflowId(event.target.value)}
            >
              <option value="">All workflows</option>
              {workflowOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="space-y-2 rounded-xl border border-slate-200 px-3 py-2">
            <legend className="px-1 text-sm font-medium text-slate-700">Status</legend>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((value) => (
                <label
                  key={value}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
                    statuses.includes(value)
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={statuses.includes(value)}
                    onChange={() => toggleStatus(value)}
                  />
                  {value}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="space-y-1 text-sm text-slate-700">
            <span className="font-medium">From</span>
            <input
              type="date"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </label>

          <label className="space-y-1 text-sm text-slate-700">
            <span className="font-medium">To</span>
            <input
              type="date"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </label>
        </div>
      </section>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      ) : null}

      {runs.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-12 text-center text-slate-600 shadow-sm">
          No runs yet. Publish a workflow to see executions here.
        </p>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-white/70 bg-white/95 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Workflow name</th>
                  <th className="px-4 py-3 font-medium">Trigger type</th>
                  <th className="px-4 py-3 font-medium">Started</th>
                  <th className="px-4 py-3 font-medium">Duration</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.runId} className="border-t border-slate-100 text-slate-700">
                    <td className="px-4 py-3">
                      <Link href={`/runs/${run.runId}`} className="font-medium text-sky-700 hover:underline">
                        {run.workflowName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 capitalize">{run.triggerType}</td>
                    <td className="px-4 py-3">{new Date(run.startedAt).toLocaleString()}</td>
                    <td className="px-4 py-3">{formatDuration(run.durationMs)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[run.status]}`}>
                        {run.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {cursor ? (
        <button
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
          disabled={loading}
          onClick={() => void load(true)}
        >
          Load more
        </button>
      ) : null}
    </main>
  );
}
