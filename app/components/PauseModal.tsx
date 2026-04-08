'use client';

import { useState } from 'react';

interface PauseModalProps {
  open: boolean;
  workflowId: string;
  workflowName: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function PauseModal({
  open,
  workflowId,
  workflowName,
  onConfirm,
  onClose,
}: PauseModalProps) {
  const [pausing, setPausing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handlePause() {
    setPausing(true);
    setError(null);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/pause`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Pause failed (${res.status})`);
      }
      onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setPausing(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={`Pause ${workflowName}`}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">Pause Workflow</h2>
        <p className="mt-1 text-sm text-slate-500">
          Are you sure you want to pause <span className="font-medium text-slate-700">{workflowName}</span>?
        </p>

        <p className="mt-3 text-sm text-amber-600">
          This will stop all scheduled and webhook triggers.
        </p>

        {error && (
          <p className="mt-3 text-sm text-rose-600" role="alert">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pausing}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pausing}
            onClick={handlePause}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pausing ? 'Pausing…' : 'Pause'}
          </button>
        </div>
      </div>
    </div>
  );
}
