import { RunStatus } from '../../packages/types/src/events';

export interface StatusBadgeViewModel {
  label: string;
  colorClass: string;
  animate: boolean;
}

export const STATUS_BADGE_MAP: Record<RunStatus, StatusBadgeViewModel> = {
  [RunStatus.SUCCESS]: { label: 'Success', colorClass: 'bg-green-100 text-green-800', animate: false },
  [RunStatus.FAILED]: { label: 'Failed', colorClass: 'bg-red-100 text-red-800', animate: false },
  [RunStatus.RUNNING]: { label: 'Running', colorClass: 'bg-amber-100 text-amber-800', animate: true },
  [RunStatus.PENDING]: { label: 'Pending', colorClass: 'bg-gray-100 text-gray-800', animate: false },
  [RunStatus.REPLAYING]: { label: 'Replaying', colorClass: 'bg-blue-100 text-blue-800', animate: false },
};

export function getStatusBadge(status: RunStatus): StatusBadgeViewModel {
  return STATUS_BADGE_MAP[status];
}
