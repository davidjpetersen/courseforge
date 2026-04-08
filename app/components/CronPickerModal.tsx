'use client';

import { useState, useEffect } from 'react';
import {
  parseCronExpression,
  cronToPlainLanguage,
  isMinimumInterval,
  getNextRunTimes,
} from '../lib/workflow-ui-utils';

interface CronPickerModalProps {
  open: boolean;
  initialCron?: string;
  onSave: (cron: string) => void;
  onClose: () => void;
}

const MIN_INTERVAL_MINUTES = 15;

export function CronPickerModal({ open, initialCron, onSave, onClose }: CronPickerModalProps) {
  const [cron, setCron] = useState(initialCron ?? '');

  useEffect(() => {
    if (open) {
      setCron(initialCron ?? '');
    }
  }, [open, initialCron]);

  if (!open) return null;

  const parsed = parseCronExpression(cron);
  const isValid = parsed.valid;
  const meetsMinInterval = isValid && isMinimumInterval(cron, MIN_INTERVAL_MINUTES);
  const canSave = isValid && meetsMinInterval;

  const plainLanguage = isValid ? cronToPlainLanguage(cron) : null;
  const nextRuns = isValid ? getNextRunTimes(cron, 3) : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label="Edit cron schedule"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">Edit Schedule</h2>
        <p className="mt-1 text-sm text-slate-500">Enter a 5-field cron expression</p>

        <input
          type="text"
          value={cron}
          onChange={(e) => setCron(e.target.value)}
          placeholder="* * * * *"
          aria-label="Cron expression"
          className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />

        {/* Validation error */}
        {cron.trim() !== '' && !isValid && (
          <p className="mt-2 text-sm text-rose-600" role="alert">
            {parsed.error}
          </p>
        )}

        {/* Minimum interval warning */}
        {isValid && !meetsMinInterval && (
          <p className="mt-2 text-sm text-rose-600" role="alert">
            Schedule must run no more frequently than every {MIN_INTERVAL_MINUTES} minutes
          </p>
        )}

        {/* Plain-language preview */}
        {plainLanguage && (
          <p className="mt-3 text-sm text-slate-700">
            <span className="font-medium">Preview:</span> {plainLanguage}
          </p>
        )}

        {/* Next 3 run times */}
        {nextRuns.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-slate-500">Next runs</p>
            <ul className="mt-1 space-y-0.5 text-sm text-slate-600">
              {nextRuns.map((date, i) => (
                <li key={i}>{date.toLocaleString()}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => canSave && onSave(cron.trim())}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
