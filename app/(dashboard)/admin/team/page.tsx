'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

type UserRole = 'admin' | 'builder' | 'viewer';

interface TeamMember {
  userId: string;
  email: string;
  role: UserRole;
  status: string;
  lastLoginAt: string | null;
}

interface Invitation {
  inviteId: string;
  email: string;
  role: UserRole;
  inviteUrl: string;
  createdAt: string;
  expiresAt: string;
}

const ROLE_OPTIONS: UserRole[] = ['admin', 'builder', 'viewer'];

const ROLE_BADGE_COLORS: Record<UserRole, string> = {
  admin: 'bg-purple-100 text-purple-700 ring-purple-200',
  builder: 'bg-sky-100 text-sky-700 ring-sky-200',
  viewer: 'bg-slate-100 text-slate-700 ring-slate-200',
};

export default function TeamManagementPage() {
  const router = useRouter();

  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<Invitation[]>([]);

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('viewer');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

  // Remove confirmation state
  const [confirmRemoveUserId, setConfirmRemoveUserId] = useState<string | null>(null);

  // Clipboard feedback
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);

  // ── Check current user role and redirect non-admins ──
  useEffect(() => {
    async function checkAccess() {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) {
          router.push('/login');
          return;
        }
        const data = await res.json();
        if (data.role !== 'admin') {
          router.push('/runs');
          return;
        }
        setCurrentUserRole(data.role);
      } catch {
        router.push('/login');
      }
    }
    void checkAccess();
  }, [router]);

  // ── Load members once admin access is confirmed ──
  useEffect(() => {
    if (currentUserRole !== 'admin') return;

    async function loadMembers() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/team/members');
        if (!res.ok) throw new Error('Failed to load team members');
        const data = await res.json();
        setMembers(data.members ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load team members');
      } finally {
        setLoading(false);
      }
    }
    void loadMembers();
  }, [currentUserRole]);

  // ── Invite member ──
  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setLastInviteUrl(null);
    setInviteSubmitting(true);

    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteError(data.error ?? 'Failed to send invitation');
        return;
      }
      setLastInviteUrl(data.inviteUrl);
      setPendingInvites((prev) => [
        ...prev,
        {
          inviteId: data.inviteUrl?.split('token=')[1] ?? '',
          email: inviteEmail,
          role: inviteRole,
          inviteUrl: data.inviteUrl,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        },
      ]);
      setInviteEmail('');
      setInviteRole('viewer');
    } catch {
      setInviteError('Something went wrong. Please try again.');
    } finally {
      setInviteSubmitting(false);
    }
  }

  // ── Change role ──
  async function handleChangeRole(userId: string, newRole: UserRole) {
    try {
      const res = await fetch(`/api/team/members/${userId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Failed to change role');
        return;
      }
      setMembers((prev) =>
        prev.map((m) => (m.userId === userId ? { ...m, role: newRole } : m)),
      );
    } catch {
      setError('Failed to change role');
    }
  }

  // ── Remove (suspend) member ──
  async function handleRemoveMember(userId: string) {
    try {
      const res = await fetch(`/api/team/members/${userId}/suspend`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? 'Failed to remove member');
        setConfirmRemoveUserId(null);
        return;
      }
      setMembers((prev) =>
        prev.map((m) => (m.userId === userId ? { ...m, status: 'suspended' } : m)),
      );
      setConfirmRemoveUserId(null);
    } catch {
      setError('Failed to remove member');
      setConfirmRemoveUserId(null);
    }
  }

  // ── Copy invite link ──
  function handleCopyInviteLink(inviteUrl: string, inviteId: string) {
    const fullUrl = `${window.location.origin}${inviteUrl}`;
    void navigator.clipboard.writeText(fullUrl);
    setCopiedInviteId(inviteId);
    setTimeout(() => setCopiedInviteId(null), 2000);
  }

  // ── Loading / access check in progress ──
  if (currentUserRole === null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_35%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] p-6">
        <p className="text-sm text-slate-500">Checking access…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen space-y-6 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_35%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] p-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Team management</h1>
          <p className="text-sm text-slate-600">Manage your team members and invitations.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowInviteModal(true);
            setInviteError(null);
            setLastInviteUrl(null);
          }}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-700"
        >
          Invite member
        </button>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Members table (Req 15.3) ── */}
      <section className="overflow-hidden rounded-2xl border border-white/70 bg-white/95 shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Members</h2>
        </div>
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">Loading members…</p>
        ) : members.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">No team members found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Last login</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.userId} className="border-t border-slate-100 text-slate-700">
                    <td className="px-4 py-3">{member.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${ROLE_BADGE_COLORS[member.role]}`}>
                        {member.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 capitalize">{member.status}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {member.lastLoginAt ? new Date(member.lastLoginAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {/* Change role dropdown (Req 15.5) */}
                        <select
                          aria-label={`Change role for ${member.email}`}
                          value={member.role}
                          onChange={(e) => void handleChangeRole(member.userId, e.target.value as UserRole)}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>

                        {/* Remove button with confirmation (Req 15.5) */}
                        {confirmRemoveUserId === member.userId ? (
                          <span className="flex items-center gap-1">
                            <span className="text-xs text-red-600">Confirm?</span>
                            <button
                              type="button"
                              onClick={() => void handleRemoveMember(member.userId)}
                              className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmRemoveUserId(null)}
                              className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                            >
                              No
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmRemoveUserId(member.userId)}
                            className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Pending invitations table (Req 15.6) ── */}
      <section className="overflow-hidden rounded-2xl border border-white/70 bg-white/95 shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Pending invitations</h2>
        </div>
        {pendingInvites.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">No pending invitations.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Expires</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingInvites.map((invite) => (
                  <tr key={invite.inviteId} className="border-t border-slate-100 text-slate-700">
                    <td className="px-4 py-3">{invite.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${ROLE_BADGE_COLORS[invite.role]}`}>
                        {invite.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(invite.expiresAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleCopyInviteLink(invite.inviteUrl, invite.inviteId)}
                        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        {copiedInviteId === invite.inviteId ? 'Copied!' : 'Copy invite link'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Invite member modal (Req 15.4) ── */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-slate-900">Invite a team member</h2>
            <p className="mt-1 text-sm text-slate-500">Send an invitation to join your team.</p>

            {inviteError && (
              <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {inviteError}
              </div>
            )}

            {lastInviteUrl && (
              <div role="status" className="mt-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                Invitation sent! Link: <code className="text-xs">{lastInviteUrl}</code>
              </div>
            )}

            <form onSubmit={handleInvite} className="mt-4 space-y-4">
              <div className="space-y-1">
                <label htmlFor="invite-email" className="block text-sm font-medium text-slate-700">
                  Email
                </label>
                <input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-sky-500/40"
                  placeholder="colleague@example.com"
                  required
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="invite-role" className="block text-sm font-medium text-slate-700">
                  Role
                </label>
                <select
                  id="invite-role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as UserRole)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-sky-500/40"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteSubmitting}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-700 disabled:opacity-50"
                >
                  {inviteSubmitting ? 'Sending…' : 'Send invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
