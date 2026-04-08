'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { ArchiveModal } from '../../../components/ArchiveModal';
import { PauseModal } from '../../../components/PauseModal';
import { PromoteModal } from '../../../components/PromoteModal';
import { PublishModal } from '../../../components/PublishModal';
import { StepSummaryCard } from '../../../components/StepSummaryCard';
import { WorkflowStatusBadge } from '../../../components/WorkflowStatusBadge';
import { useEnvironment } from '../../../context/EnvironmentContext';
import { CronPickerModal } from '../../../components/CronPickerModal';
import {
  buildPublishChecklist,
  cronToPlainLanguage,
  getNextRunTimes,
  getSidebarActions,
  isEditableStatus,
} from '../../../lib/workflow-ui-utils';
import type { SidebarAction, VersionRecord, WorkflowDetail } from '../../../lib/workflow-ui-utils';

type ModalType = 'publish' | 'pause' | 'archive' | 'promote';
type TabKey = 'configuration' | 'trigger' | 'connections' | 'versions';

const TAB_ITEMS: { key: TabKey; label: string }[] = [
  { key: 'configuration', label: 'Configuration' },
  { key: 'trigger', label: 'Trigger' },
  { key: 'connections', label: 'Connections' },
  { key: 'versions', label: 'Version History' },
];

const ACTION_LABELS: Record<SidebarAction, string> = {
  publish: 'Publish',
  pause: 'Pause',
  archive: 'Archive',
  promote: 'Promote to prod',
};

const ACTION_CLASSES: Record<SidebarAction, string> = {
  publish: 'rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700',
  pause: 'rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700',
  archive: 'rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700',
  promote: 'rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700',
};

function actionLabel(action: SidebarAction): string {
  return ACTION_LABELS[action] ?? action;
}

function actionButtonClasses(action: SidebarAction): string {
  return ACTION_CLASSES[action] ?? 'rounded-lg bg-slate-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700';
}

function maskWebhookUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const visiblePath = parsed.pathname.slice(0, 12);
    return `${parsed.origin}${visiblePath}${'*'.repeat(8)}`;
  } catch {
    // If not a valid URL, show first 20 chars + mask
    const visible = url.slice(0, 20);
    return `${visible}${'*'.repeat(8)}`;
  }
}

export default function WorkflowDetailPage() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const router = useRouter();
  const { environmentId } = useEnvironment();
  const [workflow, setWorkflow] = useState<WorkflowDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [activeModal, setActiveModal] = useState<ModalType | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('configuration');
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [cronModalOpen, setCronModalOpen] = useState(false);
  const [versions, setVersions] = useState<VersionRecord[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsFetched, setVersionsFetched] = useState(false);
  const [viewPlanVersion, setViewPlanVersion] = useState<VersionRecord | null>(null);

  const fetchWorkflow = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);

    try {
      const res = await fetch(`/api/workflows/${workflowId}`, {
        headers: { 'x-tenant-id': 'CURRENT' },
        cache: 'no-store',
      });

      if (res.status === 404) {
        setNotFound(true);
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message ?? 'Unable to load workflow');
      }

      setWorkflow(data as WorkflowDetail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load workflow');
    } finally {
      setLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    void fetchWorkflow();
  }, [fetchWorkflow]);

  useEffect(() => {
    if (activeTab !== 'versions' || versionsFetched) return;
    setVersionsLoading(true);
    fetch(`/api/workflows/${workflowId}/versions`, {
      headers: { 'x-tenant-id': 'CURRENT' },
      cache: 'no-store',
    })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setVersions((data as { versions: VersionRecord[] }).versions ?? []);
        }
      })
      .catch(() => {
        // silently ignore — empty state will show
      })
      .finally(() => {
        setVersionsLoading(false);
        setVersionsFetched(true);
      });
  }, [activeTab, versionsFetched, workflowId]);

  function handleModalConfirm() {
    setActiveModal(null);
    void fetchWorkflow();
  }

  function handlePromoteSuccess(newWorkflowId: string) {
    setActiveModal(null);
    router.push(`/workflows/${newWorkflowId}`);
  }

  function handleNameBlur() {
    setEditingName(false);
    // In a real app this would PATCH the workflow name; for now just update local state
    if (workflow && draftName.trim() && draftName.trim() !== workflow.name) {
      setWorkflow({ ...workflow, name: draftName.trim() });
    }
  }

  // -- Loading state --
  if (loading) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_35%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] p-6">
        <p className="text-sm text-slate-600">Loading workflow details…</p>
      </main>
    );
  }

  // -- Error state --
  if (error) {
    return (
      <main className="min-h-screen space-y-4 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_35%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] p-6">
        <nav className="text-sm">
          <Link href="/workflows" className="font-medium text-sky-700 hover:underline">
            ← Back to workflows
          </Link>
        </nav>
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      </main>
    );
  }

  // -- Not found state --
  if (notFound || !workflow) {
    return (
      <main className="min-h-screen space-y-4 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_35%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] p-6">
        <nav className="text-sm">
          <Link href="/workflows" className="font-medium text-sky-700 hover:underline">
            ← Back to workflows
          </Link>
        </nav>
        <div className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-600">
          Workflow not found
        </div>
      </main>
    );
  }

  // -- Two-column layout --
  return (
    <main className="min-h-screen space-y-6 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_35%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] p-6">
      <nav className="text-sm text-slate-600">
        <Link href="/workflows" className="font-medium text-sky-700 hover:underline">
          ← Back to workflows
        </Link>
      </nav>

      {/* Two-column on desktop (sidebar + tab panel), stacked on mobile */}
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Sidebar — left column */}
        <aside className="w-full shrink-0 lg:w-80">
          <div className="rounded-2xl border border-white/70 bg-white/95 p-5 shadow-sm">
            <div className="space-y-4">
              {/* Workflow name — editable inline when DRAFT */}
              {isEditableStatus(workflow.status) && editingName ? (
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={handleNameBlur}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleNameBlur(); }}
                  autoFocus
                  className="w-full rounded-lg border border-sky-300 px-2 py-1 text-xl font-semibold tracking-tight text-slate-900 outline-none focus:ring-2 focus:ring-sky-400"
                  aria-label="Edit workflow name"
                />
              ) : (
                <h1
                  className={`text-xl font-semibold tracking-tight text-slate-900${isEditableStatus(workflow.status) ? ' cursor-pointer hover:text-sky-700' : ''}`}
                  onClick={() => {
                    if (isEditableStatus(workflow.status)) {
                      setDraftName(workflow.name || workflow.workflowId);
                      setEditingName(true);
                    }
                  }}
                  title={isEditableStatus(workflow.status) ? 'Click to edit name' : undefined}
                >
                  {workflow.name || workflow.workflowId}
                </h1>
              )}

              {/* Status badge + environment badge */}
              <div className="flex flex-wrap items-center gap-2">
                <WorkflowStatusBadge status={workflow.status} />
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                  {workflow.environmentId}
                </span>
              </div>

              {/* Metadata */}
              <dl className="space-y-2 text-sm text-slate-600">
                <div>
                  <dt className="font-medium text-slate-900">Workflow ID</dt>
                  <dd className="font-mono text-xs">{workflow.workflowId}</dd>
                </div>
                {workflow.lastPublishedAt && (
                  <div>
                    <dt className="font-medium text-slate-900">Last published</dt>
                    <dd>{new Date(workflow.lastPublishedAt).toLocaleString()}</dd>
                  </div>
                )}
                {workflow.recipeName && (
                  <div>
                    <dt className="font-medium text-slate-900">Recipe</dt>
                    <dd>
                      <Link
                        href={`/recipes/${workflow.recipeId ?? ''}`}
                        className="font-medium text-sky-700 hover:underline"
                      >
                        {workflow.recipeName}
                      </Link>
                    </dd>
                  </div>
                )}
                {workflow.createdBy && (
                  <div>
                    <dt className="font-medium text-slate-900">Created by</dt>
                    <dd>{workflow.createdBy}</dd>
                  </div>
                )}
                {workflow.createdAt && (
                  <div>
                    <dt className="font-medium text-slate-900">Created at</dt>
                    <dd>{new Date(workflow.createdAt).toLocaleString()}</dd>
                  </div>
                )}
              </dl>

              {/* Action buttons */}
              {getSidebarActions(workflow.status, environmentId).length > 0 && (
                <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                  {getSidebarActions(workflow.status, environmentId).map((action: SidebarAction) => (
                    <button
                      key={action}
                      type="button"
                      onClick={() => setActiveModal(action)}
                      className={actionButtonClasses(action)}
                    >
                      {actionLabel(action)}
                    </button>
                  ))}
                </div>
              )}

              {/* View runs link */}
              <div className="border-t border-slate-100 pt-4">
                <Link
                  href={`/runs?workflowId=${workflowId}`}
                  className="text-sm font-medium text-sky-700 hover:underline"
                >
                  View runs →
                </Link>
              </div>
            </div>
          </div>

          {/* Modals */}
          <PublishModal
            open={activeModal === 'publish'}
            workflowId={workflow.workflowId}
            workflowName={workflow.name || workflow.workflowId}
            checklistItems={buildPublishChecklist(workflow)}
            onConfirm={handleModalConfirm}
            onClose={() => setActiveModal(null)}
          />
          <PauseModal
            open={activeModal === 'pause'}
            workflowId={workflow.workflowId}
            workflowName={workflow.name || workflow.workflowId}
            onConfirm={handleModalConfirm}
            onClose={() => setActiveModal(null)}
          />
          <ArchiveModal
            open={activeModal === 'archive'}
            workflowId={workflow.workflowId}
            workflowName={workflow.name || workflow.workflowId}
            currentStatus={workflow.status}
            onConfirm={handleModalConfirm}
            onClose={() => setActiveModal(null)}
          />
          <PromoteModal
            open={activeModal === 'promote'}
            workflowId={workflow.workflowId}
            workflowName={workflow.name || workflow.workflowId}
            onSuccess={handlePromoteSuccess}
            onClose={() => setActiveModal(null)}
          />
        </aside>

        {/* Tab panel — right column */}
        <section className="min-w-0 flex-1">
          <div className="rounded-2xl border border-white/70 bg-white/95 shadow-sm">
            {/* Tab bar */}
            <nav className="flex border-b border-slate-200" role="tablist">
              {TAB_ITEMS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.key}
                  aria-controls={`panel-${tab.key}`}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === tab.key
                      ? 'border-b-2 border-indigo-600 text-indigo-600'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            {/* Tab panel content */}
            <div id={`panel-${activeTab}`} role="tabpanel" className="p-5">
              {activeTab === 'configuration' && (
                <div className="space-y-4">
                  {isEditableStatus(workflow.status) && (
                    <div className="flex justify-end">
                      <Link
                        href={`/recipes/${workflow.recipeId ?? ''}?edit=true&workflowId=${workflow.workflowId}`}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                      >
                        Edit configuration
                      </Link>
                    </div>
                  )}
                  {workflow.compiledPlan && workflow.compiledPlan.length > 0 ? (
                    <div className="space-y-3">
                      {workflow.compiledPlan.map((step, idx) => (
                        <StepSummaryCard
                          key={step.stepId}
                          index={idx + 1}
                          label={step.name}
                          params={step.params}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">No configuration steps defined.</p>
                  )}
                </div>
              )}
              {activeTab === 'trigger' && (
                <div className="space-y-4">
                  {!workflow.triggerType ? (
                    <p className="text-sm text-slate-500">No trigger configured.</p>
                  ) : workflow.triggerType === 'webhook' ? (
                    <>
                      <h3 className="text-sm font-semibold text-slate-900">Webhook</h3>
                      {workflow.triggerConfig?.url && (
                        <div>
                          <dt className="text-xs font-medium text-slate-500">Webhook URL</dt>
                          <dd className="mt-1 font-mono text-sm text-slate-700">
                            {maskWebhookUrl(workflow.triggerConfig.url as string)}
                          </dd>
                        </div>
                      )}
                      <button
                        type="button"
                        className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
                      >
                        Rotate webhook secret
                      </button>
                      <div>
                        <p className="mb-1 text-xs font-medium text-slate-500">Example</p>
                        <pre className="overflow-x-auto rounded-lg bg-slate-800 p-3 text-xs text-slate-100">
{`curl -X POST \\
  ${(workflow.triggerConfig?.url as string) ?? 'https://example.com/webhook'} \\
  -H "Content-Type: application/json" \\
  -H "X-Webhook-Secret: <your-secret>" \\
  -d '{"event": "trigger"}'`}
                        </pre>
                      </div>
                    </>
                  ) : (
                    <>
                      <h3 className="text-sm font-semibold text-slate-900">Scheduled</h3>
                      {workflow.triggerConfig?.cron && (
                        <>
                          <div>
                            <dt className="text-xs font-medium text-slate-500">Schedule</dt>
                            <dd className="mt-1 text-sm text-slate-700">
                              {cronToPlainLanguage(workflow.triggerConfig.cron as string)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-slate-500">Next run</dt>
                            <dd className="mt-1 text-sm text-slate-700">
                              {(() => {
                                const runs = getNextRunTimes(workflow.triggerConfig!.cron as string, 1);
                                return runs.length > 0 ? runs[0].toLocaleString() : '—';
                              })()}
                            </dd>
                          </div>
                        </>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setCronModalOpen(true)}
                          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                        >
                          Edit schedule
                        </button>
                        <button
                          type="button"
                          className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
                        >
                          Pause schedule
                        </button>
                      </div>
                      <CronPickerModal
                        open={cronModalOpen}
                        initialCron={(workflow.triggerConfig?.cron as string) ?? ''}
                        onSave={(cron) => {
                          setCronModalOpen(false);
                          // In a real app, PATCH the trigger config here
                          setWorkflow({
                            ...workflow,
                            triggerConfig: { ...workflow.triggerConfig, cron },
                          });
                        }}
                        onClose={() => setCronModalOpen(false)}
                      />
                    </>
                  )}
                </div>
              )}
              {activeTab === 'connections' && (
                <div className="space-y-4">
                  {workflow.connections && workflow.connections.some((c) => c.status === 'error') && (
                    <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>
                        One or more connections need attention.{' '}
                        <Link href="/connections" className="font-medium text-amber-900 underline hover:text-amber-700">
                          Go to connections
                        </Link>
                      </span>
                    </div>
                  )}
                  {workflow.connections && workflow.connections.length > 0 ? (
                    <ul className="divide-y divide-slate-100">
                      {workflow.connections.map((conn) => (
                        <li key={conn.connectionId} className="flex items-center justify-between py-3">
                          <div>
                            <p className="text-sm font-medium text-slate-900">{conn.name}</p>
                            <p className="text-xs text-slate-500">{conn.connectorType}</p>
                          </div>
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              conn.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700'
                                : conn.status === 'error'
                                  ? 'bg-rose-50 text-rose-700'
                                  : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {conn.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-500">No connections configured.</p>
                  )}
                </div>
              )}
              {activeTab === 'versions' && (
                <div className="space-y-4">
                  {/* Rollback not available tooltip */}
                  <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-800">
                    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Rollback is not available in MVP. You can view previous versions but cannot revert to them.</span>
                  </div>

                  {versionsLoading ? (
                    <p className="text-sm text-slate-500">Loading version history…</p>
                  ) : versions.length === 0 ? (
                    <p className="text-sm text-slate-500">No versions published yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wider text-slate-500">
                            <th className="px-3 py-2">Version</th>
                            <th className="px-3 py-2">Published by</th>
                            <th className="px-3 py-2">Published at</th>
                            <th className="px-3 py-2">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {versions.map((v) => (
                            <tr key={v.versionId} className="hover:bg-slate-50">
                              <td className="px-3 py-2 font-mono text-xs">{v.semver}</td>
                              <td className="px-3 py-2 text-slate-700">{v.createdBy}</td>
                              <td className="px-3 py-2 text-slate-700">{new Date(v.createdAt).toLocaleString()}</td>
                              <td className="px-3 py-2">
                                <button
                                  type="button"
                                  onClick={() => setViewPlanVersion(v)}
                                  className="text-sm font-medium text-sky-700 hover:underline"
                                >
                                  View compiled plan
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* View compiled plan modal */}
                  {viewPlanVersion && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setViewPlanVersion(null)}>
                      <div
                        className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <h2 className="text-lg font-semibold text-slate-900">
                          Compiled Plan — v{viewPlanVersion.semver}
                        </h2>
                        <div className="mt-4 space-y-2">
                          {workflow.currentVersionSummary?.stepNames && workflow.currentVersionSummary.stepNames.length > 0 ? (
                            <ol className="list-inside list-decimal space-y-1 text-sm text-slate-700">
                              {workflow.currentVersionSummary.stepNames.map((name) => (
                                <li key={name}>{name}</li>
                              ))}
                            </ol>
                          ) : (
                            <p className="text-sm text-slate-500">No step information available for this version.</p>
                          )}
                        </div>
                        <div className="mt-6 flex justify-end">
                          <button
                            type="button"
                            onClick={() => setViewPlanVersion(null)}
                            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
