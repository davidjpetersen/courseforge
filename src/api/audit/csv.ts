import type { AuditEntry } from '../../../packages/types/src/audit';

const HEADER = 'timestamp,actor,actorEmail,actionType,resourceType,resourceId,detail';

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function formatAuditCsv(entries: AuditEntry[]): string {
  const rows = entries.map((entry) => {
    const fields = [
      entry.timestamp,
      entry.actor,
      entry.actorEmail,
      entry.actionType,
      entry.resourceType,
      entry.resourceId,
      JSON.stringify(entry.detail),
    ];
    return fields.map(escapeCsvField).join(',');
  });

  return [HEADER, ...rows].join('\n');
}
