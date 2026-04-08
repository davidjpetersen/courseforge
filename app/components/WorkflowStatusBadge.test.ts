import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const source = readFileSync(
  resolve(__dirname, 'WorkflowStatusBadge.tsx'),
  'utf-8',
);

describe('WorkflowStatusBadge component structure', () => {
  it('has use client directive at the top', () => {
    expect(source.trimStart().startsWith("'use client'")).toBe(true);
  });

  it('imports getStatusBadgeClasses from workflow-ui-utils', () => {
    expect(source).toContain('getStatusBadgeClasses');
    expect(source).toMatch(/from\s+['"]\.\.\/lib\/workflow-ui-utils['"]/);
  });

  it('exports WorkflowStatusBadge function', () => {
    expect(source).toContain('export function WorkflowStatusBadge');
  });

  it('accepts a status prop', () => {
    expect(source).toContain('status');
    expect(source).toMatch(/\{\s*status\s*\}/);
  });

  it('renders a span with pill badge classes matching existing pattern', () => {
    expect(source).toContain('inline-flex');
    expect(source).toContain('rounded-full');
    expect(source).toContain('px-2.5');
    expect(source).toContain('py-1');
    expect(source).toContain('text-xs');
    expect(source).toContain('font-semibold');
  });

  it('calls getStatusBadgeClasses with status', () => {
    expect(source).toContain('getStatusBadgeClasses(status)');
  });

  it('renders the status text inside the badge', () => {
    expect(source).toContain('{status}');
  });
});
