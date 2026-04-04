export interface Connection {
    connectionId: string;
    tenantId: string;
    status: 'active' | 'error' | 'pending' | 'deleted';
    secretRef: string;
}
export interface RecipeStep {
    stepId: string;
    name: string;
    type: 'trigger' | 'action';
    params: Record<string, unknown>;
    requiredParams?: string[];
}
export interface Recipe {
    recipeId: string;
    steps: RecipeStep[];
}
export interface StepDefinition {
    stepId: string;
    name: string;
    type: 'trigger' | 'action';
    params: Record<string, unknown>;
}
export declare class CompilationError extends Error {
    readonly field: string;
    constructor(field: string, message: string);
}
export declare function compilePlan(recipe: Recipe, params: Record<string, unknown>, connections: Connection[]): StepDefinition[];
//# sourceMappingURL=compile-plan.d.ts.map