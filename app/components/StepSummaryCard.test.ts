import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const source = readFileSync(
  resolve(__dirname, 'StepSummaryCard.tsx'),
  'utf-8',
);

describe('StepSummaryCard component structure', () => {
  it('has use client directive at the top', () => {
    expect(source.trimStart().startsWith("'use client'")).toBe(true);
  });

  it('imports maskSensitiveFields from mask-sensitive', () => {
    expect(source).toContain('maskSensitiveFields');
    expect(source).toMatch(/from\s+['"]\.\.\/lib\/mask-sensitive['"]/);
  });

  it('exports StepSummaryCard function', () => {
    expect(source).toContain('export function StepSummaryCard');
  });

  it('accepts index, connectorIcon, label, and params props', () => {
    expect(source).toContain('index');
    expect(source).toContain('connectorIcon');
    expect(source).toContain('label');
    expect(source).toContain('params');
  });

  it('calls maskSensitiveFields with params before rendering', () => {
    expect(source).toContain('maskSensitiveFields(params)');
  });

  it('renders step index', () => {
    expect(source).toContain('{index}');
  });

  it('renders label', () => {
    expect(source).toContain('{label}');
  });

  it('uses rounded card styling matching existing patterns', () => {
    expect(source).toContain('rounded-2xl');
    expect(source).toContain('border');
    expect(source).toContain('shadow-sm');
  });

  it('renders masked key-value pairs', () => {
    expect(source).toContain('Object.entries(masked)');
    expect(source).toContain('String(value)');
  });

  it('defines the correct props interface', () => {
    expect(source).toContain('index: number');
    expect(source).toContain('connectorIcon?: string');
    expect(source).toContain('label: string');
    expect(source).toContain('params: Record<string, unknown>');
  });
});
