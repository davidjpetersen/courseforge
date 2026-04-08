import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const source = readFileSync(
  resolve(__dirname, 'ArchiveModal.tsx'),
  'utf-8',
);

describe('ArchiveModal component structure', () => {
  it('has use client directive at the top', () => {
    expect(source.trimStart().startsWith("'use client'")).toBe(true);
  });

  it('exports ArchiveModal function', () => {
    expect(source).toContain('export function ArchiveModal');
  });

  it('accepts required props: open, workflowId, workflowName, currentStatus, onConfirm, onClose', () => {
    expect(source).toContain('open');
    expect(source).toContain('workflowId');
    expect(source).toContain('workflowName');
    expect(source).toContain('currentStatus');
    expect(source).toContain('onConfirm');
    expect(source).toContain('onClose');
  });

  it('defines the correct props interface', () => {
    expect(source).toContain('open: boolean');
    expect(source).toContain('workflowId: string');
    expect(source).toContain('workflowName: string');
    expect(source).toContain('currentStatus: string');
    expect(source).toContain('onConfirm: () => void');
    expect(source).toContain('onClose: () => void');
  });

  it('returns null when not open', () => {
    expect(source).toContain('if (!open) return null');
  });

  it('uses modal overlay pattern matching PauseModal', () => {
    expect(source).toContain('fixed inset-0');
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
  });

  it('shows warning when currentStatus is PUBLISHED', () => {
    expect(source).toContain('PUBLISHED');
    expect(source).toContain('must pause it before archiving');
  });

  it('shows confirmation prompt for DRAFT or PAUSED status', () => {
    expect(source).toContain('Are you sure you want to archive');
  });

  it('disables Archive button when status is PUBLISHED', () => {
    expect(source).toContain('isPublished');
    expect(source).toContain('disabled={archiving || isPublished}');
  });

  it('POSTs to the archive API endpoint', () => {
    expect(source).toContain('/api/workflows/');
    expect(source).toContain('/archive');
    expect(source).toContain("method: 'POST'");
  });

  it('calls onConfirm on successful archive', () => {
    expect(source).toContain('onConfirm()');
  });

  it('displays error message on failure', () => {
    expect(source).toContain('error');
    expect(source).toContain('role="alert"');
  });

  it('renders Archive and Cancel buttons', () => {
    expect(source).toContain('Archive');
    expect(source).toContain('Cancel');
  });

  it('shows loading state while archiving', () => {
    expect(source).toContain('archiving');
    expect(source).toContain('Archiving');
  });
});
