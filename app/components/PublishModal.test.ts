import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const source = readFileSync(
  resolve(__dirname, 'PublishModal.tsx'),
  'utf-8',
);

describe('PublishModal component structure', () => {
  it('has use client directive at the top', () => {
    expect(source.trimStart().startsWith("'use client'")).toBe(true);
  });

  it('imports ChecklistItem from workflow-ui-utils', () => {
    expect(source).toContain('ChecklistItem');
    expect(source).toMatch(/from\s+['"]\.\.\/lib\/workflow-ui-utils['"]/);
  });

  it('imports PublishChecklist from PublishChecklist', () => {
    expect(source).toContain('PublishChecklist');
    expect(source).toMatch(/from\s+['"]\.\/PublishChecklist['"]/);
  });

  it('exports PublishModal function', () => {
    expect(source).toContain('export function PublishModal');
  });

  it('accepts required props: open, workflowId, workflowName, checklistItems, onConfirm, onClose', () => {
    expect(source).toContain('open');
    expect(source).toContain('workflowId');
    expect(source).toContain('workflowName');
    expect(source).toContain('checklistItems');
    expect(source).toContain('onConfirm');
    expect(source).toContain('onClose');
  });

  it('defines the correct props interface', () => {
    expect(source).toContain('open: boolean');
    expect(source).toContain('workflowId: string');
    expect(source).toContain('workflowName: string');
    expect(source).toContain('checklistItems: ChecklistItem[]');
    expect(source).toContain('onConfirm: () => void');
    expect(source).toContain('onClose: () => void');
  });

  it('returns null when not open', () => {
    expect(source).toContain('if (!open) return null');
  });

  it('uses modal overlay pattern matching CronPickerModal', () => {
    expect(source).toContain('fixed inset-0');
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
  });

  it('renders PublishChecklist with checklistItems', () => {
    expect(source).toContain('<PublishChecklist');
    expect(source).toContain('items={checklistItems}');
  });

  it('disables Publish button until all checklist items pass', () => {
    expect(source).toContain('allPassed');
    expect(source).toContain('disabled={!allPassed');
  });

  it('POSTs to the publish API endpoint', () => {
    expect(source).toContain('/api/workflows/');
    expect(source).toContain('/publish');
    expect(source).toContain("method: 'POST'");
  });

  it('calls onConfirm on successful publish', () => {
    expect(source).toContain('onConfirm()');
  });

  it('displays error message on failure', () => {
    expect(source).toContain('error');
    expect(source).toContain('role="alert"');
  });

  it('renders Publish and Cancel buttons', () => {
    expect(source).toContain('Publish');
    expect(source).toContain('Cancel');
  });

  it('shows loading state while publishing', () => {
    expect(source).toContain('publishing');
    expect(source).toContain('Publishing');
  });
});
