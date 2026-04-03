/**
 * View-model builders for the Template Catalog UI.
 *
 * These are pure TypeScript functions that transform Template data
 * into structured output objects representing what the UI would render.
 */
import { groupByCategory, toSummary } from '../api/templates/logic.js';
/**
 * Builds a card view model from a template.
 * Card views display: name, description, connected systems,
 * time-to-activate, and education standard tags.
 */
export function buildCardViewModel(template) {
    return {
        templateId: template.templateId,
        name: template.name,
        description: template.description,
        connectedSystems: template.connectedSystems,
        timeToActivate: template.timeToActivate,
        educationStandardTags: template.educationStandardTags,
    };
}
/**
 * Builds a detail view model from a template and the tenant's configured connections.
 * Detail views include everything in the card view plus required parameters,
 * step count, missing connection warnings, and a "Configure" CTA flag.
 */
export function buildDetailViewModel(template, tenantConnections) {
    const configured = new Set(tenantConnections);
    const missingConnections = template.connectedSystems.filter((sys) => !configured.has(sys));
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
/**
 * Builds the full catalog view model from a list of templates.
 * Templates are converted to summaries and grouped by category.
 * A template with multiple categories appears under each one.
 */
export function buildCatalogViewModel(templates) {
    const summaries = templates.map(toSummary);
    return {
        templates: summaries,
        groupedByCategory: groupByCategory(summaries),
    };
}
//# sourceMappingURL=catalog.js.map