import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const source = readFileSync(
  resolve(__dirname, 'PromoteModal.tsx'),
  'utf-8',
);

describe('PromoteModal component structure', () => {
  it('has use client directive at the top', () => {
    expect(source.trimStart().startsWith("'use client'")).toBe(true);
  });

  it('exports PromoteModal function', () => {
    expect(source).toContain('export function PromoteModal');
  });

  it('accepts required props: open, workflowId, workflowName, onSuccess, onClose', () => {
    expect(source).toContain('open');
    expect(source).toContain('workflowId');
    expect(source).toContain('workflowName');
    expect(source).toContain('onSuccess');
    expect(source).toContain('onClose');
  });

  it('defines the correct props interface', () => {
    expect(source).toContain('open: boolean');
    expect(source).toContain('workflowId: string');
    expect(source).toContain('workflowName: string');
    expect(source).toContain('onSuccess: (newWorkflowId: string) => void');
    expect(source).toContain('onClose: () => void');
  });

  it('returns null when not open', () => {
    expect(source).toContain('if (!open) return null');
  });

  it('uses modal overlay pattern matching other modals', () => {
    expect(source).toContain('fixed inset-0');
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
  });

  it('displays the promote explanation message', () => {
    expect(source).toContain('Creates a new workflow in prod as a DRAFT. You must publish it separately.');
  });

  it('POSTs to the promote API endpoint', () => {
    expect(source).toContain('/api/workflows/');
    expect(source).toContain('/promote');
    expect(source).toContain("method: 'POST'");
  });

  it('calls onSuccess with newWorkflowId on successful promote', () => {
    expect(source).toContain('onSuccess(data.newWorkflowId)');
  });

  it('shows success link to new workflow after promotion', () => {
    expect(source).toContain('/workflows/${newWorkflowId}');
    expect(source).toContain('View new workflow');
  });

  it('displays error message on failure', () => {
    expect(source).toContain('error');
    expect(source).toContain('role="alert"');
  });

  it('renders Promote and Cancel buttons', () => {
    expect(source).toContain('Promote');
    expect(source).toContain('Cancel');
  });

  it('shows loading state while promoting', () => {
    expect(source).toContain('promoting');
    expect(source).toContain('Promoting');
  });
});
