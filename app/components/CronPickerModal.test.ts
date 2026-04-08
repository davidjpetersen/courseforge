import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const source = readFileSync(
  resolve(__dirname, 'CronPickerModal.tsx'),
  'utf-8',
);

describe('CronPickerModal component structure', () => {
  it('has use client directive at the top', () => {
    expect(source.trimStart().startsWith("'use client'")).toBe(true);
  });

  it('imports parseCronExpression from workflow-ui-utils', () => {
    expect(source).toContain('parseCronExpression');
  });

  it('imports cronToPlainLanguage from workflow-ui-utils', () => {
    expect(source).toContain('cronToPlainLanguage');
  });

  it('imports isMinimumInterval from workflow-ui-utils', () => {
    expect(source).toContain('isMinimumInterval');
  });

  it('imports getNextRunTimes from workflow-ui-utils', () => {
    expect(source).toContain('getNextRunTimes');
  });

  it('imports from workflow-ui-utils module', () => {
    expect(source).toMatch(/from\s+['"]\.\.\/lib\/workflow-ui-utils['"]/);
  });

  it('exports CronPickerModal function', () => {
    expect(source).toContain('export function CronPickerModal');
  });

  it('accepts open, initialCron, onSave, onClose props', () => {
    expect(source).toContain('open');
    expect(source).toContain('initialCron');
    expect(source).toContain('onSave');
    expect(source).toContain('onClose');
  });

  it('defines the correct props interface', () => {
    expect(source).toContain('open: boolean');
    expect(source).toContain('initialCron?: string');
    expect(source).toContain('onSave: (cron: string) => void');
    expect(source).toContain('onClose: () => void');
  });

  it('returns null when not open', () => {
    expect(source).toContain('if (!open) return null');
  });

  it('renders a cron input field', () => {
    expect(source).toContain('input');
    expect(source).toContain('Cron expression');
  });

  it('calls parseCronExpression for validation', () => {
    expect(source).toContain('parseCronExpression(cron)');
  });

  it('calls cronToPlainLanguage for plain-language preview', () => {
    expect(source).toContain('cronToPlainLanguage(cron)');
  });

  it('calls isMinimumInterval with 15 minutes', () => {
    expect(source).toContain('isMinimumInterval(cron');
    expect(source).toContain('15');
  });

  it('calls getNextRunTimes for next 3 runs', () => {
    expect(source).toContain('getNextRunTimes(cron, 3)');
  });

  it('shows validation error when expression is invalid', () => {
    expect(source).toContain('parsed.error');
    expect(source).toContain('role="alert"');
  });

  it('shows minimum interval warning', () => {
    expect(source).toContain('meetsMinInterval');
    expect(source).toContain('MIN_INTERVAL_MINUTES');
    expect(source).toContain('minutes');
  });

  it('disables Save button when expression is invalid or below minimum interval', () => {
    expect(source).toContain('disabled={!canSave}');
  });

  it('renders Save and Cancel buttons', () => {
    expect(source).toContain('Save');
    expect(source).toContain('Cancel');
  });

  it('uses modal overlay pattern', () => {
    expect(source).toContain('fixed inset-0');
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
  });
});
