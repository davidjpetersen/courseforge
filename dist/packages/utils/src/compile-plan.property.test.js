import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { CompilationError, compilePlan, } from './compile-plan.js';
// ── Arbitraries ──
// Exclude built-in Object.prototype property names (toString, valueOf, etc.)
// since `params["toString"]` resolves to an inherited function, not undefined.
const forbiddenKeys = new Set(Object.getOwnPropertyNames(Object.prototype));
const arbParamKey = fc
    .string({ minLength: 1, maxLength: 20 })
    .filter((s) => /^\w+$/.test(s) && !forbiddenKeys.has(s));
const arbParamValue = fc.string({ minLength: 1, maxLength: 50 });
const arbId = fc.uuid();
/** Generate a simple recipe with no templates or required params — always compiles successfully. */
const arbSimpleStep = (overrides = {}) => fc.record({
    stepId: fc.string({ minLength: 1 }),
    name: fc.string({ minLength: 1 }),
    type: fc.constantFrom('trigger', 'action'),
    params: fc.record({ label: fc.string() }),
    ...overrides,
});
const arbSimpleRecipe = fc.array(arbSimpleStep(), { minLength: 1, maxLength: 5 }).map((steps, index) => ({
    recipeId: `recipe-${index}`,
    steps,
}));
// ── Property 12: Compilation Size Invariant ──
describe('Feature: workflow-management-api, Property 12: Compilation Size Invariant', () => {
    it('output length equals number of steps in the recipe', () => {
        fc.assert(fc.property(arbSimpleRecipe, (recipe) => {
            const result = compilePlan(recipe, {}, []);
            expect(result).toHaveLength(recipe.steps.length);
        }), { numRuns: 100 });
    });
});
// ── Property 13: Compilation Completeness ──
function hasUnresolvedTemplates(value) {
    if (typeof value === 'string') {
        return /\{\{[^}]+\}\}/.test(value);
    }
    if (Array.isArray(value)) {
        return value.some(hasUnresolvedTemplates);
    }
    if (typeof value === 'object' && value !== null) {
        return Object.values(value).some(hasUnresolvedTemplates);
    }
    return false;
}
describe('Feature: workflow-management-api, Property 13: Compilation Completeness', () => {
    it('no compiled step contains unresolved {{ }} placeholders', () => {
        fc.assert(fc.property(arbParamKey, arbParamValue, (key, value) => {
            const recipe = {
                recipeId: 'r1',
                steps: [
                    {
                        stepId: 's1',
                        name: 'Step',
                        type: 'action',
                        params: { field: `{{${key}}}` },
                    },
                ],
            };
            const result = compilePlan(recipe, { [key]: value }, []);
            for (const step of result) {
                expect(hasUnresolvedTemplates(step.params)).toBe(false);
            }
        }), { numRuns: 100 });
    });
});
// ── Property 14: Compilation ConnectionKey Resolution ──
describe('Feature: workflow-management-api, Property 14: Compilation ConnectionKey Resolution', () => {
    it('connectionKey in a recipe step resolves to the corresponding secretRef', () => {
        fc.assert(fc.property(arbId, fc.string({ minLength: 1 }), (connectionId, secretRef) => {
            const connection = {
                connectionId,
                tenantId: 'tenant-1',
                status: 'active',
                secretRef,
            };
            const recipe = {
                recipeId: 'r1',
                steps: [
                    {
                        stepId: 's1',
                        name: 'Step',
                        type: 'action',
                        params: {
                            auth: { connectionKey: connectionId },
                        },
                    },
                ],
            };
            const result = compilePlan(recipe, {}, [connection]);
            const auth = (result[0]?.params.auth ?? {});
            expect(auth.secretRef).toBe(secretRef);
        }), { numRuns: 100 });
    });
});
// ── Property 15: Compilation Rejects Missing Required Params ──
describe('Feature: workflow-management-api, Property 15: Compilation Rejects Missing Required Params', () => {
    it('throws CompilationError with the missing param field when a required param is absent', () => {
        fc.assert(fc.property(arbParamKey, fc.array(arbParamKey, { minLength: 0, maxLength: 3 }), (missingKey, otherKeys) => {
            // Ensure missingKey isn't in otherKeys
            fc.pre(!otherKeys.includes(missingKey));
            const recipe = {
                recipeId: 'r1',
                steps: [
                    {
                        stepId: 's1',
                        name: 'Step',
                        type: 'action',
                        requiredParams: [...otherKeys, missingKey],
                        params: {},
                    },
                ],
            };
            // Provide params for all keys EXCEPT missingKey
            const params = Object.fromEntries(otherKeys.map((k) => [k, 'value']));
            let caughtError;
            try {
                compilePlan(recipe, params, []);
            }
            catch (e) {
                caughtError = e;
            }
            expect(caughtError).toBeInstanceOf(CompilationError);
            expect(caughtError.field).toBe(missingKey);
        }), { numRuns: 100 });
    });
});
// ── Property 16: Compilation Rejects Unresolvable References ──
describe('Feature: workflow-management-api, Property 16: Compilation Rejects Unresolvable References', () => {
    it('throws CompilationError when a {{ key }} template references a missing param', () => {
        fc.assert(fc.property(arbParamKey, (key) => {
            const recipe = {
                recipeId: 'r1',
                steps: [
                    {
                        stepId: 's1',
                        name: 'Step',
                        type: 'action',
                        params: { field: `{{${key}}}` },
                    },
                ],
            };
            expect(() => compilePlan(recipe, {}, [])).toThrow(CompilationError);
        }), { numRuns: 100 });
    });
    it('throws CompilationError when a connectionKey is not in the connections array', () => {
        fc.assert(fc.property(arbId, arbId, (connectionKey, otherId) => {
            fc.pre(connectionKey !== otherId);
            const recipe = {
                recipeId: 'r1',
                steps: [
                    {
                        stepId: 's1',
                        name: 'Step',
                        type: 'action',
                        params: { auth: { connectionKey } },
                    },
                ],
            };
            const otherConnection = {
                connectionId: otherId,
                tenantId: 'tenant-1',
                status: 'active',
                secretRef: 'arn',
            };
            expect(() => compilePlan(recipe, {}, [otherConnection])).toThrow(CompilationError);
        }), { numRuns: 100 });
    });
});
//# sourceMappingURL=compile-plan.property.test.js.map