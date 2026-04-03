/**
 * Pure logic functions for the Template API.
 *
 * These are intentionally decoupled from DynamoDB so they can be
 * property-tested with arbitrary inputs.
 */
import type { Template } from '../../models/types.js';
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
export interface TemplateDetailResponse extends Template {
    stepCount: number;
    missingConnections: string[];
}
/**
 * Filters templates by selected categories.
 *
 * - If `selectedCategories` is empty, returns all templates.
 * - Otherwise returns only templates that have at least one category
 *   in the selected set.
 */
export declare function filterByCategory(templates: Template[], selectedCategories: string[]): Template[];
/**
 * Groups template summaries by category.
 * A template with multiple categories appears under each one.
 */
export declare function groupByCategory(summaries: TemplateSummary[]): Record<string, TemplateSummary[]>;
export declare function toSummary(template: Template): TemplateSummary;
export declare function buildListResponse(templates: Template[], selectedCategories: string[]): TemplateListResponse;
/**
 * Returns the set of connected systems required by the template
 * that the tenant has NOT yet configured.
 *
 * Formally: template.connectedSystems − tenantConfiguredConnections
 */
export declare function detectMissingConnections(templateConnectedSystems: string[], tenantConfiguredConnections: string[]): string[];
export declare function buildDetailResponse(template: Template, tenantConfiguredConnections: string[]): TemplateDetailResponse;
//# sourceMappingURL=logic.d.ts.map