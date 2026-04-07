'use client';

import { useEffect, useState } from 'react';

import type { AuditEntry } from '../../../../packages/types/src/audit';
import { ActionType } from '../../../../packages/types/src/audit';

const ACTION_TYPE_OPTIONS = Object.values(ActionType);

// TODO: Replace with real auth check (e.g. session/cookie-based role lookup)
const CURRENT_USER_ROLE = 'Admin';
const CURRENT_TENANT_ID = 'CURRENT';

function truncateJson(detail: Record<string, unknown>, maxLen = 80): string {
  const str = JSON.stringify(detail);
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

export default function AuditLogPage() {
  const [userRole] = useState(CURRENT_USER_ROLE);

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [actionType, setActionType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [actorSearch, setActorSearch] = useState('');

  // ── 403 Forbidden for non-Admin users (Task 9.2) ──
  if (userRole !== 'Admin') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_35%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] p-6">
        <div className="max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-4xl font-bold text-rose-600">403</h1>
          <p className="mt-2 text-lg font-medium text-slate-900">Forbidden</p>
          <p className="mt-1 text-sm text-slate-600">
            You do not have permission to view the audit log. Admin role is required.
          </p>
        </div>
      </main>
    );
  }

  async function load(append = false) {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (actionType) params.set('actionType', actionType);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (actorSearch) params.set('actor', actorSearch);
    if (append && cursor) params.set('cursor', cursor);

    try {
      const response = await fetch(`/api/audit?${params.toString()}`, {
        cache: 'no-store',
        headers: {
          'x-tenant-id': CURRENT_TENANT_ID,
          'x-user-role': userRole,
        },
      });
      const data = (await response.json()) as {
        entries?: AuditEntry[];
        nextCursor?: string;
        message?: string;
      };
      if (!response.ok || !data.entries) {
        throw new Error(data.message ?? 'Unable to load audit entries');
      }

      setEntries((prev) => (append ? [...prev, ...data.entries!] : data.entries!));
      setCursor(data.nextCursor);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load audit entries');
    } finally {
      setLoading(false);
    }
  }

  async function handleExportCsv() {
    const params = new URLSearchParams();
    if (actionType) params.set('actionType', actionType);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (actorSearch) params.set('actor', actorSearch);

    try {
      const response = await fetch(`/api/audit/export?${params.toString()}`, {
        cache: 'no-store',
        headers: {
          'x-tenant-id': CURRENT_TENANT_ID,
          'x-user-role': userRole,
        },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message ?? 'Export failed');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'audit-log.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Export failed');
    }
  }

  // biome-ignore lint: filters are dependencies
  useEffect(() => {
    setEntries([]);
    setCursor(undefined);
    void load(false);
  }, [actionType, dateFrom, dateTo, actorSearch]);

  return (
    <main className="min-h-screen space-y-6 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_35%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Audit log</h1>
        <p className="text-sm text-slate-600">
          Review all platform activity. This log is read-only and cannot be modified.
        </p>
      </div>

      {/* ── Filter bar ── */}
      <section className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm backdrop-blur">
        <div className="grid gap-4 lg:grid-cols-[minmax(14rem,1fr)_auto_auto_minmax(14rem,1fr)_auto]">
          <label className="space-y-1 text-sm text-slate-700">
            <span className="font-medium">Action type</span>
            <select
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
              value={actionType}
              onChange={(e) => setActionType(e.target.value)}
            >
              <option value="">All actions</option>
              {ACTION_TYPE_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm text-slate-700">
            <span className="font-medium">From</span>
            <input
              type="date"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>

          <label className="space-y-1 text-sm text-slate-700">
            <span className="font-medium">To</span>
            <input
              type="date"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>

          <label className="space-y-1 text-sm text-slate-700">
            <span className="font-medium">Actor</span>
            <input
              type="text"
              placeholder="Search by actor…"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
              value={actorSearch}
              onChange={(e) => setActorSearch(e.target.value)}
            />
          </label>

          <div className="flex items-end">
            <button
              type="button"
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              onClick={handleExportCsv}
            >
              Export CSV
            </button>
          </div>
        </div>
      </section>

      {/* ── Error ── */}
      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {/* ── Table (read-only, Task 9.3) ── */}
      {entries.length === 0 && !loading ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-12 text-center text-slate-600 shadow-sm">
          No audit entries found. Adjust your filters or check back later.
        </p>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-white/70 bg-white/95 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Timestamp</th>
                  <th className="px-4 py-3 font-medium">Actor</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Resource</th>
                  <th className="px-4 py-3 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.auditId}
                    className="border-t border-slate-100 text-slate-700"
                  >
                    <td className="whitespace-nowrap px-4 py-3">
                      {new Date(entry.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">{entry.actor}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200">
                        {entry.actionType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {entry.resourceType}/{entry.resourceId}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 font-mono text-xs text-slate-500">
                      {truncateJson(entry.detail)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Cursor-based pagination ── */}
      {cursor ? (
        <button
          type="button"
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
          disabled={loading}
          onClick={() => void load(true)}
        >
          Load more
        </button>
      ) : null}
    </main>
  );
}
