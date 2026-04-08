'use client';

import type { ChecklistItem } from '../lib/workflow-ui-utils';

interface PublishChecklistProps {
  items: ChecklistItem[];
}

export function PublishChecklist({ items }: PublishChecklistProps) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2 text-sm">
          {item.passed ? (
            <span className="text-emerald-600" aria-label="Passed">✓</span>
          ) : (
            <span className="text-rose-600" aria-label="Failed">✗</span>
          )}
          <span className={item.passed ? 'text-slate-700' : 'text-slate-500'}>
            {item.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
