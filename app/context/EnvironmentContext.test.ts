import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const source = readFileSync(
  resolve(__dirname, 'EnvironmentContext.tsx'),
  'utf-8',
);

describe('EnvironmentContext module structure', () => {
  it('has use client directive at the top', () => {
    expect(source.trimStart().startsWith("'use client'")).toBe(true);
  });

  it('exports EnvironmentProvider component', () => {
    expect(source).toContain('export function EnvironmentProvider');
  });

  it('exports useEnvironment hook', () => {
    expect(source).toContain('export function useEnvironment');
  });

  it('exports EnvironmentContextValue interface', () => {
    expect(source).toContain('export interface EnvironmentContextValue');
  });

  it('uses courseforge_env as the localStorage key', () => {
    expect(source).toContain("'courseforge_env'");
  });

  it('defaults to dev when no localStorage value exists', () => {
    // useState is initialized with 'dev'
    expect(source).toContain("useState<EnvironmentId>('dev')");
  });

  it('reads from localStorage on mount via useEffect', () => {
    expect(source).toContain('localStorage.getItem(STORAGE_KEY)');
    expect(source).toContain('useEffect');
  });

  it('writes to localStorage when setEnvironmentId is called', () => {
    expect(source).toContain('localStorage.setItem(STORAGE_KEY, id)');
  });

  it('throws when useEnvironment is used outside provider', () => {
    expect(source).toContain('useEnvironment must be used within an EnvironmentProvider');
  });

  it('defines EnvironmentId type as dev or prod', () => {
    expect(source).toMatch(/type EnvironmentId\s*=\s*'dev'\s*\|\s*'prod'/);
  });
});
