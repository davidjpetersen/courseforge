'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import type { Run } from '../../../packages/types/src/runs';

const STATUS_CLASS: Record<Run['status'], string> = {
  SUCCESS: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
  RUNNING: 'bg-amber-100 text-amber-800 animate-pulse',
  PENDING: 'bg-gray-100 text-gray-800',
  REPLAYING: 'bg-blue-100 text-blue-800',
};

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();

  const [workflowId, setWorkflowId] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const hasActiveRun = useMemo(
    () => runs.some((run) => run.status === 'RUNNING' || run.status === 'PENDING'),
    [runs],
  );

  async function load(append = false) {
    const params = new URLSearchParams();
    if (workflowId) params.set('workflowId', workflowId);
    if (status) params.set('status', status);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (append && cursor) params.set('cursor', cursor);

    const response = await fetch(`/api/runs?${params.toString()}`);
    const data = (await response.json()) as { runs: Run[]; nextCursor?: string };
    setRuns((prev) => (append ? [...prev, ...data.runs] : data.runs));
    setCursor(data.nextCursor);
  }

  useEffect(() => {
    void load(false);
  }, [workflowId, status, dateFrom, dateTo]);

  useEffect(() => {
    if (!hasActiveRun) return;
    const id = setInterval(() => {
      void load(false);
    }, 30_000);

    return () => clearInterval(id);
  }, [hasActiveRun, workflowId, status, dateFrom, dateTo]);

  return (
    <main className="space-y-4 p-6">
      <h1 className="text-xl font-semibold">Run history</h1>
      <section className="flex flex-wrap gap-2">
        <input className="rounded border px-2 py-1" placeholder="Workflow ID" value={workflowId} onChange={(e) => setWorkflowId(e.target.value)} />
        <select className="rounded border px-2 py-1" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="FAILED">FAILED</option>
          <option value="RUNNING">RUNNING</option>
          <option value="PENDING">PENDING</option>
          <option value="SUCCESS">SUCCESS</option>
          <option value="REPLAYING">REPLAYING</option>
        </select>
        <input type="date" className="rounded border px-2 py-1" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <input type="date" className="rounded border px-2 py-1" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
      </section>

      {runs.length === 0 ? (
        <p className="rounded border border-dashed p-8 text-center text-gray-600">
          No runs yet. Publish a workflow to see executions here.
        </p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-gray-600">
              <th className="p-2">Workflow name</th>
              <th className="p-2">Trigger type</th>
              <th className="p-2">Started</th>
              <th className="p-2">Duration</th>
              <th className="p-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.runId} className="border-b">
                <td className="p-2"><Link href={`/runs/${run.runId}`} className="text-blue-700 hover:underline">{run.workflowName}</Link></td>
                <td className="p-2">{run.triggerType}</td>
                <td className="p-2">{new Date(run.startedAt).toLocaleString()}</td>
                <td className="p-2">{run.durationMs ? `${run.durationMs} ms` : '—'}</td>
                <td className="p-2"><span className={`rounded px-2 py-1 text-xs font-medium ${STATUS_CLASS[run.status]}`}>{run.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {cursor ? <button className="rounded border px-3 py-2" onClick={() => void load(true)}>Load more</button> : null}
    </main>
  );
}
