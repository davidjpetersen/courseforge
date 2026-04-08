import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const source = readFileSync(
  resolve(__dirname, 'PauseModal.tsx'),
  'utf-8',
);

describe('PauseModal component structure', () => {
  it('has use client directive at the top', () => {
    expect(source.trimStart().startsWith("'use client'")).toBe(true);
  });

  it('exports PauseModal function', () => {
    expect(source).toContain('export function PauseModal');
  });

  it('accepts required props: open, workflowId, workflowName, onConfirm, onClose', () => {
    expect(source).toContain('open');
    expect(source).toContain('workflowId');
    expect(source).toContain('workflowName');
    expect(source).toContain('onConfirm');
    expect(source).toContain('onClose');
  });

  it('defines the correct props interface', () => {
    expect(source).toContain('open: boolean');
    expect(source).toContain('workflowId: string');
    expect(source).toContain('workflowName: string');
    expect(source).toContain('onConfirm: () => void');
    expect(source).toContain('onClose: () => void');
  });

  it('returns null when not open', () => {
    expect(source).toContain('if (!open) return null');
  });

  it('uses modal overlay pattern matching PublishModal', () => {
    expect(source).toContain('fixed inset-0');
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
  });

  it('displays the warning message about triggers', () => {
    expect(source).toContain('This will stop all scheduled and webhook triggers.');
  });

  it('POSTs to the pause API endpoint', () => {
    expect(source).toContain('/api/workflows/');
    expect(source).toContain('/pause');
    expect(source).toContain("method: 'POST'");
  });

  it('calls onConfirm on successful pause', () => {
    expect(source).toContain('onConfirm()');
  });

  it('displays error message on failure', () => {
    expect(source).toContain('error');
    expect(source).toContain('role="alert"');
  });

  it('renders Pause and Cancel buttons', () => {
    expect(source).toContain('Pause');
    expect(source).toContain('Cancel');
  });

  it('shows loading state while pausing', () => {
    expect(source).toContain('pausing');
    expect(source).toContain('Pausing');
  });
});
