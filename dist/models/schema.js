/**
 * DynamoDB Single-Table Schema for Recipe Library
 *
 * Table: RecipeLibrary
 *
 * Access Patterns:
 *   1. Get template by ID        → PK = TEMPLATE#{templateId}, SK = METADATA
 *   2. List templates by category → GSI1PK = CATEGORY#{categoryName}, GSI1SK = TEMPLATE#{templateId}
 *   3. List workflows by tenant   → PK = TENANT#{tenantId}, SK = WORKFLOW#{workflowId}
 *   4. Get workflow by ID         → PK = TENANT#{tenantId}, SK = WORKFLOW#{workflowId}
 */
// ── Key Prefixes ──
export const KEY_PREFIX = {
    TEMPLATE: 'TEMPLATE#',
    CATEGORY: 'CATEGORY#',
    TENANT: 'TENANT#',
    WORKFLOW: 'WORKFLOW#',
    CONNECTION: 'CONNECTION#',
    AUDIT: 'AUDIT#',
};
export const SK_VALUES = {
    METADATA: 'METADATA',
};
// ── Key Builders ──
export function templatePK(templateId) {
    return `${KEY_PREFIX.TEMPLATE}${templateId}`;
}
export function templateSK() {
    return SK_VALUES.METADATA;
}
export function categoryGSI1PK(categoryName) {
    return `${KEY_PREFIX.CATEGORY}${categoryName}`;
}
export function categoryGSI1SK(templateId) {
    return `${KEY_PREFIX.TEMPLATE}${templateId}`;
}
export function tenantPK(tenantId) {
    return `${KEY_PREFIX.TENANT}${tenantId}`;
}
export function workflowSK(workflowId) {
    return `${KEY_PREFIX.WORKFLOW}${workflowId}`;
}
export function connectionSK(connectionId) {
    return `${KEY_PREFIX.CONNECTION}${connectionId}`;
}
export function auditSK(timestamp, id) {
    return `${KEY_PREFIX.AUDIT}${timestamp}#${id}`;
}
export function buildSecretName(tenantId, connectionId) {
    return `courseforge/tenant/${tenantId}/connection/${connectionId}`;
}
// ── Table & Index Names ──
export const TABLE_NAME = 'RecipeLibrary';
export const CATEGORY_INDEX = 'CategoryIndex';
// ── CloudFormation-style Table Definition ──
export const TABLE_DEFINITION = {
    TableName: TABLE_NAME,
    KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' },
        { AttributeName: 'GSI1PK', AttributeType: 'S' },
        { AttributeName: 'GSI1SK', AttributeType: 'S' },
    ],
    GlobalSecondaryIndexes: [
        {
            IndexName: CATEGORY_INDEX,
            KeySchema: [
                { AttributeName: 'GSI1PK', KeyType: 'HASH' },
                { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'ALL' },
        },
    ],
    BillingMode: 'PAY_PER_REQUEST',
};
// ── Category Index Item Builders ──
/**
 * For templates with multiple categories, we need to write a category index
 * item for each category so the template appears in every category partition.
 *
 * Returns the GSI key attributes for each category the template belongs to.
 */
export function buildCategoryIndexKeys(templateId, categories) {
    return categories.map((category) => ({
        GSI1PK: categoryGSI1PK(category),
        GSI1SK: categoryGSI1SK(templateId),
    }));
}
//# sourceMappingURL=schema.js.map