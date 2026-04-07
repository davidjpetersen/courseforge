'use client';

import { useEffect, useState } from 'react';

import { EnvironmentSelector } from '../../components/EnvironmentSelector';
import { useEnvironment } from '../../context/EnvironmentContext';

interface WorkflowSummary {
  workflowId: string;
  name: string;
  status: string;
  environmentId: string;
}

const STATUS_CLASS: Record<string, string> = {
  PUBLISHED: 'bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200',
  DRAFT: 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200',
  PAUSED: 'bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200',
  ARCHIVED: 'bg-rose-100 text-rose-800 ring-1 ring-inset ring-rose-200',
};

export default function WorkflowsPage() {
  const { environmentId } = useEnvironment();
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchWorkflows() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/environments/${environmentId}/workflows`, {
          headers: { 'x-tenant-id': 'CURRENT' },
          cache: 'no-store',
        });
        const data = (await res.json()) as { workflows?: WorkflowSummary[]; message?: string };
        if (!res.ok || !data.workflows) {
          throw new Error(data.message ?? 'Unable to load workflows');
        }
        if (!cancelled) {
          setWorkflows(data.workflows);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load workflows');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void fetchWorkflows();
    return () => { cancelled = true; };
  }, [environmentId]);

  return (
    <main className="min-h-screen space-y-6 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_35%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] p-6">
      <div className="flex items-center justify-between">
        <div />
        <EnvironmentSelector />
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Workflows</h1>
        <p className="text-sm text-slate-600">
          Manage your automation workflows across environments.
        </p>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      ) : null}

      {loading ? (
        <p className="text-center text-sm text-slate-500">Loading workflows…</p>
      ) : workflows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-12 text-center text-slate-600 shadow-sm">
          No workflows yet. Create a workflow to get started.
        </p>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-white/70 bg-white/95 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Environment</th>
                </tr>
              </thead>
              <tbody>
                {workflows.map((wf) => (
                  <tr key={wf.workflowId} className="border-t border-slate-100 text-slate-700">
                    <td className="px-4 py-3 font-medium">{wf.name || wf.workflowId}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[wf.status] ?? 'bg-slate-100 text-slate-700'}`}>
                        {wf.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">{wf.environmentId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
