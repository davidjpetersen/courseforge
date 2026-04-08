'use client';

import { useState } from 'react';
import type { ChecklistItem } from '../lib/workflow-ui-utils';
import { PublishChecklist } from './PublishChecklist';

interface PublishModalProps {
  open: boolean;
  workflowId: string;
  workflowName: string;
  checklistItems: ChecklistItem[];
  onConfirm: () => void;
  onClose: () => void;
}

export function PublishModal({
  open,
  workflowId,
  workflowName,
  checklistItems,
  onConfirm,
  onClose,
}: PublishModalProps) {
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const allPassed = checklistItems.length > 0 && checklistItems.every((item) => item.passed);

  async function handlePublish() {
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/publish`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Publish failed (${res.status})`);
      }
      onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={`Publish ${workflowName}`}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">Publish Workflow</h2>
        <p className="mt-1 text-sm text-slate-500">
          Review the checklist before publishing <span className="font-medium text-slate-700">{workflowName}</span>.
        </p>

        <div className="mt-4">
          <PublishChecklist items={checklistItems} />
        </div>

        {error && (
          <p className="mt-3 text-sm text-rose-600" role="alert">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={publishing}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!allPassed || publishing}
            onClick={handlePublish}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {publishing ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  );
}
