import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const source = readFileSync(
  resolve(__dirname, 'EnvironmentSelector.tsx'),
  'utf-8',
);

describe('EnvironmentSelector component structure', () => {
  it('has use client directive at the top', () => {
    expect(source.trimStart().startsWith("'use client'")).toBe(true);
  });

  it('imports useEnvironment from EnvironmentContext', () => {
    expect(source).toContain('useEnvironment');
    expect(source).toMatch(/from\s+['"]\.\.\/context\/EnvironmentContext['"]/);
  });

  it('exports EnvironmentSelector function', () => {
    expect(source).toContain('export function EnvironmentSelector');
  });

  it('renders a group with role="group"', () => {
    expect(source).toContain('role="group"');
  });

  it('has aria-label on the group element', () => {
    expect(source).toContain('aria-label="Environment selector"');
  });

  it('uses aria-pressed on toggle buttons', () => {
    expect(source).toContain('aria-pressed');
  });

  it('renders Dev and Prod pill options', () => {
    expect(source).toContain("label: 'Dev'");
    expect(source).toContain("label: 'Prod'");
  });

  it('calls setEnvironmentId on click', () => {
    expect(source).toContain('setEnvironmentId');
    expect(source).toContain('onClick');
  });

  it('applies distinct styling for active pill', () => {
    // Active pill has a different background color than inactive
    expect(source).toContain('#2563eb');  // active bg
    expect(source).toContain('#f1f5f9');  // inactive bg
  });

  it('reads environmentId from context to determine active state', () => {
    expect(source).toContain('environmentId === opt.id');
  });
});
