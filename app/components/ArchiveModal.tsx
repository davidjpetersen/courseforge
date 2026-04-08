'use client';

import { useState } from 'react';

interface ArchiveModalProps {
  open: boolean;
  workflowId: string;
  workflowName: string;
  currentStatus: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ArchiveModal({
  open,
  workflowId,
  workflowName,
  currentStatus,
  onConfirm,
  onClose,
}: ArchiveModalProps) {
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const isPublished = currentStatus === 'PUBLISHED';

  async function handleArchive() {
    setArchiving(true);
    setError(null);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/archive`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Archive failed (${res.status})`);
      }
      onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={`Archive ${workflowName}`}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">Archive Workflow</h2>

        {isPublished ? (
          <p className="mt-3 text-sm text-amber-600">
            This workflow is currently PUBLISHED. You must pause it before archiving.
          </p>
        ) : (
          <p className="mt-1 text-sm text-slate-500">
            Are you sure you want to archive <span className="font-medium text-slate-700">{workflowName}</span>? This action will set the workflow status to ARCHIVED.
          </p>
        )}

        {error && (
          <p className="mt-3 text-sm text-rose-600" role="alert">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={archiving}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={archiving || isPublished}
            onClick={handleArchive}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {archiving ? 'Archiving…' : 'Archive'}
          </button>
        </div>
      </div>
    </div>
  );
}
