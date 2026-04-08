'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { ArchiveModal } from '../../components/ArchiveModal';
import { EnvironmentSelector } from '../../components/EnvironmentSelector';
import { PauseModal } from '../../components/PauseModal';
import { PromoteModal } from '../../components/PromoteModal';
import { PublishModal } from '../../components/PublishModal';
import { WorkflowStatusBadge } from '../../components/WorkflowStatusBadge';
import { useEnvironment } from '../../context/EnvironmentContext';
import {
  buildPublishChecklist,
  filterWorkflowsByStatus,
  getAvailableActions,
} from '../../lib/workflow-ui-utils';
import type { ChecklistItem, ContextMenuAction, WorkflowSummary } from '../../lib/workflow-ui-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ModalType = 'publish' | 'pause' | 'archive' | 'promote';

interface ActiveModal {
  type: ModalType;
  workflow: WorkflowSummary;
}

// ---------------------------------------------------------------------------
// Action menu labels
// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<ContextMenuAction, string> = {
  publish: 'Publish',
  pause: 'Pause',
  archive: 'Archive',
  'view-runs': 'View runs',
  promote: 'Promote to prod',
};

// ---------------------------------------------------------------------------
// Context menu component
// ---------------------------------------------------------------------------

function ContextMenu({
  workflow,
  environmentId,
  onAction,
}: {
  workflow: WorkflowSummary;
  environmentId: string;
  onAction: (action: ContextMenuAction, workflow: WorkflowSummary) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const actions = getAvailableActions(workflow.status, environmentId);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        aria-label={`Actions for ${workflow.name || workflow.workflowId}`}
        onClick={() => setOpen((prev) => !prev)}
        className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        ⋮
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {actions.map((action) => (
            <button
              key={action}
              type="button"
              className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => {
                setOpen(false);
                onAction(action, workflow);
              }}
            >
              {ACTION_LABELS[action]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function WorkflowsPage() {
  const { environmentId } = useEnvironment();
  const router = useRouter();
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [statusFilter, setStatusFilter] = useState('All');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveModal | null>(null);

  const fetchWorkflows = useCallback(async () => {
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
      setWorkflows(data.workflows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load workflows');
    } finally {
      setLoading(false);
    }
  }, [environmentId]);

  useEffect(() => {
    let cancelled = false;
    void fetchWorkflows().then(() => {
      if (cancelled) {
        // Reset if component unmounted during fetch — parent useCallback handles state
      }
    });
    return () => { cancelled = true; };
  }, [fetchWorkflows]);

  // ---- Modal helpers ----

  function handleAction(action: ContextMenuAction, workflow: WorkflowSummary) {
    if (action === 'view-runs') {
      router.push(`/runs?workflowId=${workflow.workflowId}`);
      return;
    }
    // publish | pause | archive | promote → open modal
    setActiveModal({ type: action as ModalType, workflow });
  }

  function handleModalClose() {
    setActiveModal(null);
  }

  async function handleModalConfirm() {
    setActiveModal(null);
    await fetchWorkflows();
  }

  // Build checklist items for publish modal
  const publishChecklistItems: ChecklistItem[] =
    activeModal?.type === 'publish'
      ? buildPublishChecklist(activeModal.workflow as any)
      : [];

  const filteredWorkflows = filterWorkflowsByStatus(workflows, statusFilter);

  return (
    <main className="min-h-screen space-y-6 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_35%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] p-6">
      <div className="flex items-center justify-between">
        <Link
          href="/recipes"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          + New workflow
        </Link>
        <div className="flex items-center gap-3">
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {['All', 'DRAFT', 'PUBLISHED', 'PAUSED', 'ARCHIVED'].map((s) => (
              <option key={s} value={s}>{s === 'All' ? 'All statuses' : s}</option>
            ))}
          </select>
          <EnvironmentSelector />
        </div>
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
      ) : filteredWorkflows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-12 text-center shadow-sm">
          <p className="text-slate-600">No workflows yet. Choose a recipe to get started.</p>
          <Link
            href="/recipes"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Browse recipes
          </Link>
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-white/70 bg-white/95 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Recipe</th>
                  <th className="px-4 py-3 font-medium">Environment</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Last run</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredWorkflows.map((wf) => (
                  <tr key={wf.workflowId} className="border-t border-slate-100 text-slate-700">
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/workflows/${wf.workflowId}`} className="text-blue-600 hover:underline">
                        {wf.name || wf.workflowId}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{wf.recipeName ?? '—'}</td>
                    <td className="px-4 py-3">{wf.environmentId}</td>
                    <td className="px-4 py-3">
                      <WorkflowStatusBadge status={wf.status} />
                    </td>
                    <td className="px-4 py-3">{wf.lastRunAt ? new Date(wf.lastRunAt).toLocaleString() : '—'}</td>
                    <td className="px-4 py-3">
                      <ContextMenu
                        workflow={wf}
                        environmentId={environmentId}
                        onAction={handleAction}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Modals */}
      <PublishModal
        open={activeModal?.type === 'publish'}
        workflowId={activeModal?.workflow.workflowId ?? ''}
        workflowName={activeModal?.workflow.name ?? ''}
        checklistItems={publishChecklistItems}
        onConfirm={handleModalConfirm}
        onClose={handleModalClose}
      />

      <PauseModal
        open={activeModal?.type === 'pause'}
        workflowId={activeModal?.workflow.workflowId ?? ''}
        workflowName={activeModal?.workflow.name ?? ''}
        onConfirm={handleModalConfirm}
        onClose={handleModalClose}
      />

      <ArchiveModal
        open={activeModal?.type === 'archive'}
        workflowId={activeModal?.workflow.workflowId ?? ''}
        workflowName={activeModal?.workflow.name ?? ''}
        currentStatus={activeModal?.workflow.status ?? ''}
        onConfirm={handleModalConfirm}
        onClose={handleModalClose}
      />

      <PromoteModal
        open={activeModal?.type === 'promote'}
        workflowId={activeModal?.workflow.workflowId ?? ''}
        workflowName={activeModal?.workflow.name ?? ''}
        onSuccess={() => handleModalConfirm()}
        onClose={handleModalClose}
      />
    </main>
  );
}
