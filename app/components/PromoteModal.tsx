'use client';

import { useState } from 'react';
import Link from 'next/link';

interface PromoteModalProps {
  open: boolean;
  workflowId: string;
  workflowName: string;
  onSuccess: (newWorkflowId: string) => void;
  onClose: () => void;
}

export function PromoteModal({
  open,
  workflowId,
  workflowName,
  onSuccess,
  onClose,
}: PromoteModalProps) {
  const [promoting, setPromoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newWorkflowId, setNewWorkflowId] = useState<string | null>(null);

  if (!open) return null;

  async function handlePromote() {
    setPromoting(true);
    setError(null);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/promote`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? `Promote failed (${res.status})`);
      }
      const data = await res.json();
      setNewWorkflowId(data.newWorkflowId);
      onSuccess(data.newWorkflowId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setPromoting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={`Promote ${workflowName}`}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">Promote to Production</h2>
        <p className="mt-1 text-sm text-slate-500">
          Promote <span className="font-medium text-slate-700">{workflowName}</span> to production.
        </p>

        <p className="mt-3 text-sm text-amber-600">
          Creates a new workflow in prod as a DRAFT. You must publish it separately.
        </p>

        {newWorkflowId && (
          <p className="mt-3 text-sm text-emerald-600">
            Promoted successfully!{' '}
            <Link
              href={`/workflows/${newWorkflowId}`}
              className="font-medium underline hover:text-emerald-700"
            >
              View new workflow
            </Link>
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
            disabled={promoting}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {newWorkflowId ? 'Close' : 'Cancel'}
          </button>
          {!newWorkflowId && (
            <button
              type="button"
              disabled={promoting}
              onClick={handlePromote}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {promoting ? 'Promoting…' : 'Promote'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
