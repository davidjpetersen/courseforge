import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const source = readFileSync(
  resolve(__dirname, 'PublishChecklist.tsx'),
  'utf-8',
);

describe('PublishChecklist component structure', () => {
  it('has use client directive at the top', () => {
    expect(source.trimStart().startsWith("'use client'")).toBe(true);
  });

  it('imports ChecklistItem from workflow-ui-utils', () => {
    expect(source).toContain('ChecklistItem');
    expect(source).toMatch(/from\s+['"]\.\.\/lib\/workflow-ui-utils['"]/);
  });

  it('exports PublishChecklist function', () => {
    expect(source).toContain('export function PublishChecklist');
  });

  it('accepts items prop typed as ChecklistItem[]', () => {
    expect(source).toContain('items');
    expect(source).toContain('ChecklistItem[]');
  });

  it('renders a pass icon with green/emerald color for passing items', () => {
    expect(source).toContain('emerald');
    expect(source).toMatch(/[✓✔☑]/);
  });

  it('renders a fail icon with red/rose color for failing items', () => {
    expect(source).toContain('rose');
    expect(source).toMatch(/[✗✘✕×]/);
  });

  it('renders item labels', () => {
    expect(source).toContain('item.label');
  });

  it('conditionally styles based on passed boolean', () => {
    expect(source).toContain('item.passed');
  });
});
