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
export declare const KEY_PREFIX: {
    readonly TEMPLATE: "TEMPLATE#";
    readonly CATEGORY: "CATEGORY#";
    readonly TENANT: "TENANT#";
    readonly WORKFLOW: "WORKFLOW#";
    readonly WORKFLOW_ENTITY: "WF#";
    readonly CONNECTION: "CONNECTION#";
    readonly AUDIT: "AUDIT#";
    readonly WEBHOOK_SECRET: "WEBHOOK_SECRET#";
    readonly RUN: "RUN#";
    readonly SCHEDULE: "SCHEDULE#";
};
export declare const SK_VALUES: {
    readonly METADATA: "METADATA";
    readonly META: "META";
};
export declare function templatePK(templateId: string): string;
export declare function templateSK(): string;
export declare function categoryGSI1PK(categoryName: string): string;
export declare function categoryGSI1SK(templateId: string): string;
export declare function tenantPK(tenantId: string): string;
export declare function workflowSK(workflowId: string): string;
export declare function workflowPK(workflowId: string): string;
export declare function workflowMetaSK(): string;
export declare function connectionSK(connectionId: string): string;
export declare function auditSK(timestamp: string, id: string): string;
export declare function webhookSecretSK(workflowId: string): string;
export declare function runSK(timestamp: string, runId: string): string;
export declare function schedulePK(workflowId: string): string;
export declare function scheduleSK(scheduleId: string): string;
export declare function buildSecretName(tenantId: string, connectionId: string): string;
export declare const TABLE_NAME = "RecipeLibrary";
export declare const CATEGORY_INDEX = "CategoryIndex";
export declare const TABLE_DEFINITION: {
    readonly TableName: "RecipeLibrary";
    readonly KeySchema: readonly [{
        readonly AttributeName: "PK";
        readonly KeyType: "HASH";
    }, {
        readonly AttributeName: "SK";
        readonly KeyType: "RANGE";
    }];
    readonly AttributeDefinitions: readonly [{
        readonly AttributeName: "PK";
        readonly AttributeType: "S";
    }, {
        readonly AttributeName: "SK";
        readonly AttributeType: "S";
    }, {
        readonly AttributeName: "GSI1PK";
        readonly AttributeType: "S";
    }, {
        readonly AttributeName: "GSI1SK";
        readonly AttributeType: "S";
    }];
    readonly GlobalSecondaryIndexes: readonly [{
        readonly IndexName: "CategoryIndex";
        readonly KeySchema: readonly [{
            readonly AttributeName: "GSI1PK";
            readonly KeyType: "HASH";
        }, {
            readonly AttributeName: "GSI1SK";
            readonly KeyType: "RANGE";
        }];
        readonly Projection: {
            readonly ProjectionType: "ALL";
        };
    }];
    readonly BillingMode: "PAY_PER_REQUEST";
};
/**
 * For templates with multiple categories, we need to write a category index
 * item for each category so the template appears in every category partition.
 *
 * Returns the GSI key attributes for each category the template belongs to.
 */
export declare function buildCategoryIndexKeys(templateId: string, categories: string[]): Array<{
    GSI1PK: string;
    GSI1SK: string;
}>;
//# sourceMappingURL=schema.d.ts.map