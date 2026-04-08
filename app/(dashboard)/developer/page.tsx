'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

interface ApiKey {
  keyId: string;
  name: string;
  scope: 'read' | 'write';
  createdAt: string;
  lastUsedAt: string | null;
  enabled: boolean;
}

export default function DeveloperPortalPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScope, setNewKeyScope] = useState<'read' | 'write'>('read');
  const [creating, setCreating] = useState(false);
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Revoke dialog state
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);
  const [revoking, setRevoking] = useState(false);

  // Stub usage statistics
  const stubStats = { requestsToday: 0, requestsThisMonth: 0 };

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/developer/keys', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? 'Unable to load API keys');
      }
      setKeys(Array.isArray(data) ? data : data.keys ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load API keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchKeys();
  }, [fetchKeys]);

  async function handleCreate() {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/developer/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim(), scope: newKeyScope }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to create key');
      }
      setCreatedRawKey(data.key);
      void fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create key');
      setShowCreateModal(false);
    } finally {
      setCreating(false);
    }
  }

  function openCreateModal() {
    setNewKeyName('');
    setNewKeyScope('read');
    setCreatedRawKey(null);
    setCopied(false);
    setShowCreateModal(true);
  }

  function closeCreateModal() {
    setShowCreateModal(false);
    setCreatedRawKey(null);
    setCopied(false);
  }

  async function handleCopy() {
    if (createdRawKey) {
      await navigator.clipboard.writeText(createdRawKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handleRevoke() {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      const res = await fetch(`/api/developer/keys/${revokeTarget.keyId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to revoke key');
      }
      setRevokeTarget(null);
      void fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke key');
      setRevokeTarget(null);
    } finally {
      setRevoking(false);
    }
  }

  return (
    <main className="min-h-screen space-y-6 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_35%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Developer Portal</h1>
        <p className="text-sm text-slate-600">
          Manage your API keys and monitor usage.{' '}
          <Link href="/developer/docs" className="text-sky-700 hover:underline">
            View API Documentation →
          </Link>
        </p>
      </div>

      {/* Stub usage statistics */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/80 bg-white/90 p-5 shadow-sm backdrop-blur">
          <p className="text-sm font-medium text-slate-500">Requests today</p>
          <p className="mt-1 text-3xl font-semibold text-slate-900">{stubStats.requestsToday}</p>
        </div>
        <div className="rounded-2xl border border-white/80 bg-white/90 p-5 shadow-sm backdrop-blur">
          <p className="text-sm font-medium text-slate-500">Requests this month</p>
          <p className="mt-1 text-3xl font-semibold text-slate-900">{stubStats.requestsThisMonth}</p>
        </div>
      </section>

      {/* API Keys section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">API Keys</h2>
          <button
            onClick={openCreateModal}
            className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700"
          >
            Create key
          </button>
        </div>

        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
        ) : null}

        {loading ? (
          <p className="text-center text-sm text-slate-500">Loading keys…</p>
        ) : keys.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-12 text-center text-slate-600 shadow-sm">
            No API keys yet. Create one to get started.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/70 bg-white/95 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Scope</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium">Last used</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k.keyId} className="border-t border-slate-100 text-slate-700">
                      <td className="px-4 py-3 font-medium">{k.name}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200">
                          {k.scope}
                        </span>
                      </td>
                      <td className="px-4 py-3">{new Date(k.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            k.enabled
                              ? 'bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200'
                              : 'bg-rose-100 text-rose-800 ring-1 ring-inset ring-rose-200'
                          }`}
                        >
                          {k.enabled ? 'Active' : 'Revoked'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {k.enabled ? (
                          <button
                            onClick={() => setRevokeTarget(k)}
                            className="text-sm font-medium text-rose-600 hover:text-rose-700 hover:underline"
                          >
                            Revoke
                          </button>
                        ) : (
                          <span className="text-sm text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Create key modal */}
      {showCreateModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            {createdRawKey ? (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-900">Key created</h3>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  ⚠️ Copy this key now. It will not be shown again.
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 overflow-x-auto rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-800">
                    {createdRawKey}
                  </code>
                  <button
                    onClick={handleCopy}
                    className="shrink-0 rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-700"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <button
                  onClick={closeCreateModal}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-900">Create API key</h3>
                <label className="block space-y-1 text-sm text-slate-700">
                  <span className="font-medium">Name</span>
                  <input
                    type="text"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="e.g. Production integration"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                  />
                </label>
                <label className="block space-y-1 text-sm text-slate-700">
                  <span className="font-medium">Scope</span>
                  <select
                    value={newKeyScope}
                    onChange={(e) => setNewKeyScope(e.target.value as 'read' | 'write')}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                  >
                    <option value="read">Read</option>
                    <option value="write">Write</option>
                  </select>
                </label>
                <div className="flex gap-3">
                  <button
                    onClick={closeCreateModal}
                    className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={creating || !newKeyName.trim()}
                    className="flex-1 rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
                  >
                    {creating ? 'Creating…' : 'Create'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Revoke confirmation dialog */}
      {revokeTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Revoke API key</h3>
            <p className="mt-2 text-sm text-slate-600">
              Are you sure you want to revoke <span className="font-medium">{revokeTarget.name}</span>? This action cannot be undone.
            </p>
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setRevokeTarget(null)}
                className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRevoke}
                disabled={revoking}
                className="flex-1 rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-rose-700 disabled:opacity-60"
              >
                {revoking ? 'Revoking…' : 'Revoke'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
