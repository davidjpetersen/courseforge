'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useEnvironment } from '../../../context/EnvironmentContext';

interface WorkflowDetail {
  workflowId: string;
  name: string;
  status: string;
  environmentId: string;
}

interface PromoteResult {
  newWorkflowId: string;
  environmentId: string;
  status: string;
}

const STATUS_CLASS: Record<string, string> = {
  PUBLISHED: 'bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200',
  DRAFT: 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200',
  PAUSED: 'bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200',
  ARCHIVED: 'bg-rose-100 text-rose-800 ring-1 ring-inset ring-rose-200',
};

export default function WorkflowDetailPage({
  params,
}: {
  params: { workflowId: string };
}) {
  const { environmentId: selectedEnv } = useEnvironment();
  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [promoting, setPromoting] = useState(false);
  const [promoteResult, setPromoteResult] = useState<PromoteResult | null>(null);
  const [promoteError, setPromoteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchWorkflow() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/environments/${selectedEnv}/workflows`,
          {
            headers: { 'x-tenant-id': 'CURRENT' },
            cache: 'no-store',
          },
        );
        const data = (await res.json()) as {
          workflows?: WorkflowDetail[];
          message?: string;
        };
        if (!res.ok || !data.workflows) {
          throw new Error(data.message ?? 'Unable to load workflow');
        }
        const match = data.workflows.find(
          (w) => w.workflowId === params.workflowId,
        );
        if (!cancelled) {
          setWorkflow(match ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Unable to load workflow',
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void fetchWorkflow();
    return () => {
      cancelled = true;
    };
  }, [params.workflowId, selectedEnv]);

  async function handlePromote() {
    setPromoting(true);
    setPromoteResult(null);
    setPromoteError(null);

    try {
      const res = await fetch(
        `/api/workflows/${params.workflowId}/promote`,
        {
          method: 'POST',
          headers: { 'x-tenant-id': 'CURRENT' },
        },
      );
      const data = (await res.json()) as {
        newWorkflowId?: string;
        environmentId?: string;
        status?: string;
        message?: string;
      };
      if (!res.ok || !data.newWorkflowId) {
        throw new Error(data.message ?? 'Promotion failed');
      }
      setPromoteResult({
        newWorkflowId: data.newWorkflowId,
        environmentId: data.environmentId ?? 'prod',
        status: data.status ?? 'DRAFT',
      });
    } catch (err) {
      setPromoteError(
        err instanceof Error ? err.message : 'Promotion failed',
      );
    } finally {
      setPromoting(false);
    }
  }

  const canPromote =
    workflow?.environmentId === 'dev' && workflow?.status === 'PUBLISHED';

  if (loading) {
    return (
      <div className="p-6 text-sm text-slate-600">
        Loading workflow details…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-sm text-rose-600">{error}</div>
    );
  }

  if (!workflow) {
    return (
      <div className="p-6 text-sm text-slate-600">
        Workflow not found.
      </div>
    );
  }

  return (
    <main className="min-h-screen space-y-6 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_35%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] p-6">
      <nav className="text-sm text-slate-600">
        <Link
          href="/workflows"
          className="font-medium text-sky-700 hover:underline"
        >
          ← Back to workflows
        </Link>
      </nav>

      <section className="rounded-3xl border border-white/70 bg-white/95 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {workflow.name || workflow.workflowId}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                  STATUS_CLASS[workflow.status] ??
                  'bg-slate-100 text-slate-700'
                }`}
              >
                {workflow.status}
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                {workflow.environmentId}
              </span>
            </div>
          </div>

          <dl className="grid gap-x-8 gap-y-3 text-sm text-slate-600 sm:grid-cols-2">
            <div>
              <dt className="font-medium text-slate-900">Workflow ID</dt>
              <dd className="font-mono text-xs">{workflow.workflowId}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-900">Environment</dt>
              <dd>{workflow.environmentId}</dd>
            </div>
          </dl>
        </div>
      </section>

      {canPromote && (
        <section className="flex flex-col gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-900 md:flex-row md:items-center md:justify-between">
          <p className="text-sm font-medium">
            This workflow is published in dev and ready to promote to
            production.
          </p>
          <button
            className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
            disabled={promoting}
            onClick={() => void handlePromote()}
          >
            {promoting ? 'Promoting…' : 'Promote to prod'}
          </button>
        </section>
      )}

      {promoteResult && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Promoted successfully — new workflow{' '}
          <span className="font-mono font-semibold">
            {promoteResult.newWorkflowId}
          </span>{' '}
          created with status{' '}
          <span className="font-semibold">{promoteResult.status}</span>.
        </div>
      )}

      {promoteError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {promoteError}
        </div>
      )}
    </main>
  );
}
