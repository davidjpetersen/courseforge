/**
 * View-model builders for the Template Catalog UI.
 *
 * These are pure TypeScript functions that transform Template data
 * into structured output objects representing what the UI would render.
 */

import type { Template } from '../models/types.js';
import { groupByCategory, toSummary, type TemplateSummary } from '../api/templates/logic.js';

// ── Card View Model ──

export interface CardViewModel {
  templateId: string;
  name: string;
  description: string;
  connectedSystems: string[];
  timeToActivate: string;
  educationStandardTags: string[];
}

/**
 * Builds a card view model from a template.
 * Card views display: name, description, connected systems,
 * time-to-activate, and education standard tags.
 */
export function buildCardViewModel(template: Template): CardViewModel {
  return {
    templateId: template.templateId,
    name: template.name,
    description: template.description,
    connectedSystems: template.connectedSystems,
    timeToActivate: template.timeToActivate,
    educationStandardTags: template.educationStandardTags,
  };
}

// ── Detail View Model ──

export interface DetailViewModel {
  templateId: string;
  name: string;
  description: string;
  connectedSystems: string[];
  timeToActivate: string;
  educationStandardTags: string[];
  requiredParameters: Template['requiredParameters'];
  stepCount: number;
  missingConnections: string[];
  configureCTA: boolean;
}

/**
 * Builds a detail view model from a template and the tenant's configured connections.
 * Detail views include everything in the card view plus required parameters,
 * step count, missing connection warnings, and a "Configure" CTA flag.
 */
export function buildDetailViewModel(
  template: Template,
  tenantConnections: string[],
): DetailViewModel {
  const configured = new Set(tenantConnections);
  const missingConnections = template.connectedSystems.filter(
    (sys) => !configured.has(sys),
  );

  return {
    templateId: template.templateId,
    name: template.name,
    description: template.description,
    connectedSystems: template.connectedSystems,
    timeToActivate: template.timeToActivate,
    educationStandardTags: template.educationStandardTags,
    requiredParameters: template.requiredParameters,
    stepCount: template.steps.length,
    missingConnections,
    configureCTA: true,
  };
}

// ── Catalog View Model ──

export interface CatalogViewModel {
  templates: TemplateSummary[];
  groupedByCategory: Record<string, TemplateSummary[]>;
}

/**
 * Builds the full catalog view model from a list of templates.
 * Templates are converted to summaries and grouped by category.
 * A template with multiple categories appears under each one.
 */
export function buildCatalogViewModel(templates: Template[]): CatalogViewModel {
  const summaries = templates.map(toSummary);
  return {
    templates: summaries,
    groupedByCategory: groupByCategory(summaries),
  };
}
