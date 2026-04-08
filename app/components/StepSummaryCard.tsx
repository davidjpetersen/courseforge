'use client';

import { maskSensitiveFields } from '../lib/mask-sensitive';

interface StepSummaryCardProps {
  index: number;
  connectorIcon?: string;
  label: string;
  params: Record<string, unknown>;
}

export function StepSummaryCard({ index, connectorIcon, label, params }: StepSummaryCardProps) {
  const masked = maskSensitiveFields(params) as Record<string, unknown>;

  return (
    <div className="rounded-2xl border border-white/70 bg-white/95 p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
          {index}
        </span>
        {connectorIcon && (
          <span className="text-lg" role="img" aria-label={`${label} connector icon`}>
            {connectorIcon}
          </span>
        )}
        <h3 className="text-sm font-semibold text-slate-900">{label}</h3>
      </div>

      {Object.keys(masked).length > 0 && (
        <dl className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
          {Object.entries(masked).map(([key, value]) => (
            <div key={key} className="flex gap-2">
              <dt className="font-medium text-slate-600">{key}:</dt>
              <dd className="text-slate-500">{String(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
