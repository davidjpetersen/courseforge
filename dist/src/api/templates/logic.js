/**
 * Pure logic functions for the Template API.
 *
 * These are intentionally decoupled from DynamoDB so they can be
 * property-tested with arbitrary inputs.
 */
// ── Category Filtering (Property 12) ──
/**
 * Filters templates by selected categories.
 *
 * - If `selectedCategories` is empty, returns all templates.
 * - Otherwise returns only templates that have at least one category
 *   in the selected set.
 */
export function filterByCategory(templates, selectedCategories) {
    if (selectedCategories.length === 0) {
        return templates;
    }
    const categorySet = new Set(selectedCategories);
    return templates.filter((t) => t.categories.some((c) => categorySet.has(c)));
}
// ── Grouping ──
/**
 * Groups template summaries by category.
 * A template with multiple categories appears under each one.
 */
export function groupByCategory(summaries) {
    const grouped = {};
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
export function toSummary(template) {
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
export function buildListResponse(templates, selectedCategories) {
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
export function detectMissingConnections(templateConnectedSystems, tenantConfiguredConnections) {
    const configured = new Set(tenantConfiguredConnections);
    return templateConnectedSystems.filter((sys) => !configured.has(sys));
}
// ── Build Detail Response ──
export function buildDetailResponse(template, tenantConfiguredConnections) {
    return {
        ...template,
        stepCount: template.steps.length,
        missingConnections: detectMissingConnections(template.connectedSystems, tenantConfiguredConnections),
    };
}
//# sourceMappingURL=logic.js.map