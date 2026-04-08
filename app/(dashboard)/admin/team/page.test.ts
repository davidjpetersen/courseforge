import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const source = readFileSync(
  resolve(__dirname, 'page.tsx'),
  'utf-8',
);

describe('TeamManagementPage component structure', () => {
  it('has use client directive at the top', () => {
    expect(source.trimStart().startsWith("'use client'")).toBe(true);
  });

  it('checks current user role via /api/auth/me (Req 15.1)', () => {
    expect(source).toContain("fetch('/api/auth/me')");
    expect(source).toContain("data.role !== 'admin'");
  });

  it('redirects non-admin users to /runs (Req 15.2)', () => {
    expect(source).toContain("router.push('/runs')");
  });

  it('fetches team members from /api/team/members (Req 15.3)', () => {
    expect(source).toContain("fetch('/api/team/members')");
    expect(source).toContain('data.members');
  });

  it('displays members table with email, role badge, status, and last login (Req 15.3)', () => {
    expect(source).toContain('member.email');
    expect(source).toContain('member.role');
    expect(source).toContain('member.status');
    expect(source).toContain('member.lastLoginAt');
    expect(source).toContain('ROLE_BADGE_COLORS');
  });

  it('has an Invite member button that opens a modal (Req 15.4)', () => {
    expect(source).toContain('Invite member');
    expect(source).toContain('setShowInviteModal(true)');
    expect(source).toContain('showInviteModal');
  });

  it('invite modal has email input and role selector (Req 15.4)', () => {
    expect(source).toContain('id="invite-email"');
    expect(source).toContain('id="invite-role"');
    expect(source).toContain('htmlFor="invite-email"');
    expect(source).toContain('htmlFor="invite-role"');
  });

  it('calls POST /api/team/invite on invite submit (Req 15.4)', () => {
    expect(source).toContain("fetch('/api/team/invite'");
    expect(source).toContain("method: 'POST'");
    expect(source).toContain('email: inviteEmail');
    expect(source).toContain('role: inviteRole');
  });

  it('provides a Change role dropdown per member row (Req 15.5)', () => {
    expect(source).toContain('Change role for');
    expect(source).toContain('handleChangeRole');
    expect(source).toContain('/api/team/members/');
    expect(source).toContain('/role`');
  });

  it('calls PATCH for role change (Req 15.5)', () => {
    expect(source).toContain("method: 'PATCH'");
    expect(source).toContain('role: newRole');
  });

  it('provides a Remove button with confirmation dialog per member row (Req 15.5)', () => {
    expect(source).toContain('Remove');
    expect(source).toContain('Confirm?');
    expect(source).toContain('confirmRemoveUserId');
    expect(source).toContain('handleRemoveMember');
  });

  it('calls POST /api/team/members/:userId/suspend for removal (Req 15.5)', () => {
    expect(source).toContain('/suspend');
  });

  it('displays pending invitations table (Req 15.6)', () => {
    expect(source).toContain('Pending invitations');
    expect(source).toContain('pendingInvites');
  });

  it('has a Copy invite link button for each invitation (Req 15.6)', () => {
    expect(source).toContain('Copy invite link');
    expect(source).toContain('handleCopyInviteLink');
    expect(source).toContain('navigator.clipboard.writeText');
  });

  it('has accessible labels for invite modal inputs', () => {
    expect(source).toContain('htmlFor="invite-email"');
    expect(source).toContain('htmlFor="invite-role"');
  });

  it('disables invite submit button while submitting', () => {
    expect(source).toContain('disabled={inviteSubmitting}');
  });

  it('displays error alerts with role="alert"', () => {
    expect(source).toContain('role="alert"');
  });
});
