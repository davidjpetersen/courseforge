import { describe, it, expect } from 'vitest';
import { SEED_TEMPLATES } from './seed-templates';

describe('Seed templates', () => {
  it('contains at least 3 templates', () => {
    expect(SEED_TEMPLATES.length).toBeGreaterThanOrEqual(3);
  });

  it('covers Roster Ops, Course Lifecycle, and Notifications categories', () => {
    const allCategories = SEED_TEMPLATES.flatMap((t) => t.categories);
    expect(allCategories).toContain('Roster Ops');
    expect(allCategories).toContain('Course Lifecycle');
    expect(allCategories).toContain('Notifications');
  });

  it('all templates are certified', () => {
    for (const t of SEED_TEMPLATES) {
      expect(t.certified).toBe(true);
    }
  });

  it('each template has at least one step with fields', () => {
    for (const t of SEED_TEMPLATES) {
      expect(t.steps.length).toBeGreaterThan(0);
      for (const step of t.steps) {
        expect(step.fields.length).toBeGreaterThan(0);
      }
    }
  });

  it('each template has connected systems', () => {
    for (const t of SEED_TEMPLATES) {
      expect(t.connectedSystems.length).toBeGreaterThan(0);
    }
  });

  it('each template has education standard tags', () => {
    for (const t of SEED_TEMPLATES) {
      expect(t.educationStandardTags.length).toBeGreaterThan(0);
    }
  });

  it('each template has a time-to-activate estimate', () => {
    for (const t of SEED_TEMPLATES) {
      expect(t.timeToActivate).toBeTruthy();
    }
  });

  it('each template has a valid ISO 8601 createdAt', () => {
    for (const t of SEED_TEMPLATES) {
      const parsed = new Date(t.createdAt);
      expect(parsed.getTime()).not.toBeNaN();
    }
  });
});
