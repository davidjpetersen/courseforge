'use client';

import { getStatusBadgeClasses } from '../lib/workflow-ui-utils';

interface WorkflowStatusBadgeProps {
  status: string;
}

export function WorkflowStatusBadge({ status }: WorkflowStatusBadgeProps) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusBadgeClasses(status)}`}
    >
      {status}
    </span>
  );
}
