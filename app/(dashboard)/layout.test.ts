import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const source = readFileSync(resolve(__dirname, 'layout.tsx'), 'utf-8');

describe('DashboardLayout sidebar navigation', () => {
  it('has use client directive', () => {
    expect(source.trimStart().startsWith("'use client'")).toBe(true);
  });

  it('imports Link from next/link', () => {
    expect(source).toContain("from 'next/link'");
  });

  it('imports usePathname from next/navigation', () => {
    expect(source).toContain('usePathname');
    expect(source).toContain("from 'next/navigation'");
  });

  it('includes a Workflows navigation link', () => {
    expect(source).toContain("label: 'Workflows'");
    expect(source).toContain("href: '/workflows'");
  });

  it('positions Workflows between Recipes and Connections', () => {
    const recipesIdx = source.indexOf("label: 'Recipes'");
    const workflowsIdx = source.indexOf("label: 'Workflows'");
    const connectionsIdx = source.indexOf("label: 'Connections'");

    expect(recipesIdx).toBeGreaterThan(-1);
    expect(workflowsIdx).toBeGreaterThan(-1);
    expect(connectionsIdx).toBeGreaterThan(-1);
    expect(workflowsIdx).toBeGreaterThan(recipesIdx);
    expect(workflowsIdx).toBeLessThan(connectionsIdx);
  });

  it('renders a nav element with sidebar aria-label', () => {
    expect(source).toContain('<nav');
    expect(source).toContain('aria-label');
  });

  it('wraps children in EnvironmentProvider', () => {
    expect(source).toContain('EnvironmentProvider');
  });
});
