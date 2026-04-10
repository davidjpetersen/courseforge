/**
 * Pure logic functions for the Template API.
 *
 * These are intentionally decoupled from DynamoDB so they can be
 * property-tested with arbitrary inputs.
 */

import type { Template } from '../../models/types';

// ── List Response Shapes ──

/** Summary shape returned in the list endpoint (no steps / requiredParameters). */
export interface TemplateSummary {
  templateId: string;
  name: string;
  description: string;
  categories: string[];
  connectedSystems: string[];
  timeToActivate: string;
  educationStandardTags: string[];
}

export interface TemplateListResponse {
  templates: TemplateSummary[];
  groupedByCategory: Record<string, TemplateSummary[]>;
}

// ── Detail Response Shape ──

export interface TemplateDetailResponse extends Template {
  stepCount: number;
  missingConnections: string[];
}

// ── Category Filtering (Property 12) ──

/**
 * Filters templates by selected categories.
 *
 * - If `selectedCategories` is empty, returns all templates.
 * - Otherwise returns only templates that have at least one category
 *   in the selected set.
 */
export function filterByCategory(
  templates: Template[],
  selectedCategories: string[],
): Template[] {
  if (selectedCategories.length === 0) {
    return templates;
  }
  const categorySet = new Set(selectedCategories);
  return templates.filter((t) =>
    t.categories.some((c) => categorySet.has(c)),
  );
}

// ── Grouping ──

/**
 * Groups template summaries by category.
 * A template with multiple categories appears under each one.
 */
export function groupByCategory(
  summaries: TemplateSummary[],
): Record<string, TemplateSummary[]> {
  const grouped: Record<string, TemplateSummary[]> = {};
  for (const summary of summaries) {
    for (const cat of summary.categories) {
      if (!grouped[cat]) {
        grouped[cat] = [];
      }
      grouped[cat].push(summary);
    }
  }
  return grouped;
}

// ── Template → Summary ──

export function toSummary(template: Template): TemplateSummary {
  return {
    templateId: template.templateId,
    name: template.name,
    description: template.description,
    categories: template.categories,
    connectedSystems: template.connectedSystems,
    timeToActivate: template.timeToActivate,
    educationStandardTags: template.educationStandardTags,
  };
}

// ── Build List Response ──

export function buildListResponse(
  templates: Template[],
  selectedCategories: string[],
): TemplateListResponse {
  const filtered = filterByCategory(templates, selectedCategories);
  const summaries = filtered.map(toSummary);
  return {
    templates: summaries,
    groupedByCategory: groupByCategory(summaries),
  };
}

// ── Missing Connection Detection (Property 4) ──

/**
 * Returns the set of connected systems required by the template
 * that the tenant has NOT yet configured.
 *
 * Formally: template.connectedSystems − tenantConfiguredConnections
 */
export function detectMissingConnections(
  templateConnectedSystems: string[],
  tenantConfiguredConnections: string[],
): string[] {
  const configured = new Set(tenantConfiguredConnections);
  return templateConnectedSystems.filter((sys) => !configured.has(sys));
}

// ── Build Detail Response ──

export function buildDetailResponse(
  template: Template,
  tenantConfiguredConnections: string[],
): TemplateDetailResponse {
  return {
    ...template,
    stepCount: template.steps.length,
    missingConnections: detectMissingConnections(
      template.connectedSystems,
      tenantConfiguredConnections,
    ),
  };
}
