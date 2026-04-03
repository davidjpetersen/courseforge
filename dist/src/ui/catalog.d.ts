/**
 * View-model builders for the Template Catalog UI.
 *
 * These are pure TypeScript functions that transform Template data
 * into structured output objects representing what the UI would render.
 */
import type { Template } from '../models/types.js';
import { type TemplateSummary } from '../api/templates/logic.js';
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
export declare function buildCardViewModel(template: Template): CardViewModel;
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
export declare function buildDetailViewModel(template: Template, tenantConnections: string[]): DetailViewModel;
export interface CatalogViewModel {
    templates: TemplateSummary[];
    groupedByCategory: Record<string, TemplateSummary[]>;
}
/**
 * Builds the full catalog view model from a list of templates.
 * Templates are converted to summaries and grouped by category.
 * A template with multiple categories appears under each one.
 */
export declare function buildCatalogViewModel(templates: Template[]): CatalogViewModel;
//# sourceMappingURL=catalog.d.ts.map