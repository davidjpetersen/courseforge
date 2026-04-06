import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { filterWorkflows, isValidTransition, sortVersionsDescending, summarizeSteps, toVersionMetadata, validateConnections, validateCreateRequest, } from './logic.js';
import { compareSemver } from '../../../packages/utils/src/semver.js';
// ── Arbitraries ──
const arbWorkflowStatus = fc.constantFrom('DRAFT', 'PUBLISHED', 'PAUSED', 'ARCHIVED');
const arbEnvironmentId = fc.constantFrom('dev', 'prod');
const arbId = fc.uuid();
const arbIso = fc.date().map((d) => d.toISOString());
const arbSemver = fc
    .tuple(fc.nat({ max: 10 }), fc.nat({ max: 100 }), fc.nat({ max: 100 }))
    .map(([major, minor, patch]) => `${major}.${minor}.${patch}`);
const arbWorkflowRecord = fc.record({
    PK: fc.string(),
    SK: fc.string(),
    workflowId: arbId,
    tenantId: arbId,
    name: fc.string({ minLength: 1 }),
    description: fc.string(),
    recipeId: fc.string({ minLength: 1 }),
    status: arbWorkflowStatus,
    currentVersionId: arbId,
    createdAt: arbIso,
    updatedAt: arbIso,
    createdBy: fc.string(),
    connectionIds: fc.array(arbId),
    environmentId: arbEnvironmentId,
});
const arbStepDefinition = fc.record({
    stepId: fc.string({ minLength: 1 }),
    name: fc.string({ minLength: 1 }),
    type: fc.constantFrom('trigger', 'action'),
    params: fc.record({
        secretRef: fc.option(fc.string(), { nil: undefined }),
        value: fc.option(fc.string(), { nil: undefined }),
    }),
});
const arbVersionRecord = (semver) => fc.record({
    PK: fc.string(),
    SK: fc.string(),
    versionId: arbId,
    workflowId: arbId,
    semver: semver ?? arbSemver,
    compiledPlan: fc.array(arbStepDefinition, { maxLength: 5 }),
    createdBy: fc.string(),
    createdAt: arbIso,
    recipeId: fc.string({ minLength: 1 }),
    paramSnapshot: fc.record({}),
});
const arbConnectionStatus = fc.constantFrom('active', 'error', 'pending', 'deleted');
const arbConnection = fc.record({
    connectionId: arbId,
    tenantId: arbId,
    status: arbConnectionStatus,
    secretRef: fc.string({ minLength: 1 }),
});
// ── Property 3: Workflow List Filtering ──
describe('Feature: workflow-management-api, Property 3: Workflow List Filtering', () => {
    it('returns all workflows when no filters are provided', () => {
        fc.assert(fc.property(fc.array(arbWorkflowRecord, { maxLength: 20 }), (workflows) => {
            const result = filterWorkflows(workflows);
            expect(result).toHaveLength(workflows.length);
        }), { numRuns: 100 });
    });
    it('returns only workflows matching the status filter', () => {
        fc.assert(fc.property(fc.array(arbWorkflowRecord, { maxLength: 20 }), arbWorkflowStatus, (workflows, statusFilter) => {
            const result = filterWorkflows(workflows, statusFilter);
            expect(result.every((w) => w.status === statusFilter)).toBe(true);
            expect(result).toHaveLength(workflows.filter((w) => w.status === statusFilter).length);
        }), { numRuns: 100 });
    });
    it('returns only workflows matching the environmentId filter', () => {
        fc.assert(fc.property(fc.array(arbWorkflowRecord, { maxLength: 20 }), arbEnvironmentId, (workflows, envFilter) => {
            const result = filterWorkflows(workflows, undefined, envFilter);
            expect(result.every((w) => w.environmentId === envFilter)).toBe(true);
            expect(result).toHaveLength(workflows.filter((w) => w.environmentId === envFilter).length);
        }), { numRuns: 100 });
    });
    it('applies both filters when both are provided', () => {
        fc.assert(fc.property(fc.array(arbWorkflowRecord, { maxLength: 20 }), arbWorkflowStatus, arbEnvironmentId, (workflows, statusFilter, envFilter) => {
            const result = filterWorkflows(workflows, statusFilter, envFilter);
            const expected = workflows.filter((w) => w.status === statusFilter && w.environmentId === envFilter);
            expect(result).toHaveLength(expected.length);
            expect(result.every((w) => w.status === statusFilter && w.environmentId === envFilter)).toBe(true);
        }), { numRuns: 100 });
    });
});
// ── Property 4: Step Summary Correctness ──
describe('Feature: workflow-management-api, Property 4: Step Summary Correctness', () => {
    it('returns step names in order and excludes secretRef values', () => {
        fc.assert(fc.property(fc.array(arbStepDefinition, { maxLength: 20 }), (steps) => {
            const result = summarizeSteps(steps);
            expect(result).toHaveLength(steps.length);
            expect(result).toEqual(steps.map((s) => s.name));
            for (const item of result) {
                expect(typeof item).toBe('string');
            }
        }), { numRuns: 100 });
    });
});
// ── Property 5: Version Sorting by Semver Descending ──
describe('Feature: workflow-management-api, Property 5: Version Sorting by Semver Descending', () => {
    it('sorts versions so each adjacent pair satisfies compareSemver(a, b) >= 0', () => {
        fc.assert(fc.property(fc.array(arbVersionRecord(), { maxLength: 10 }), (versions) => {
            const sorted = sortVersionsDescending(versions);
            for (let i = 0; i < sorted.length - 1; i++) {
                const a = sorted[i];
                const b = sorted[i + 1];
                expect(compareSemver(a.semver, b.semver)).toBeGreaterThanOrEqual(0);
            }
        }), { numRuns: 100 });
    });
    it('does not mutate the original array', () => {
        fc.assert(fc.property(fc.array(arbVersionRecord(), { maxLength: 10 }), (versions) => {
            const original = versions.map((v) => v.semver);
            sortVersionsDescending(versions);
            expect(versions.map((v) => v.semver)).toEqual(original);
        }), { numRuns: 100 });
    });
});
// ── Property 6: Version Metadata Projection ──
describe('Feature: workflow-management-api, Property 6: Version Metadata Projection', () => {
    it('includes exactly the six metadata fields and excludes compiledPlan and paramSnapshot', () => {
        fc.assert(fc.property(arbVersionRecord(), (version) => {
            const metadata = toVersionMetadata(version);
            expect(metadata).toHaveProperty('versionId', version.versionId);
            expect(metadata).toHaveProperty('workflowId', version.workflowId);
            expect(metadata).toHaveProperty('semver', version.semver);
            expect(metadata).toHaveProperty('createdBy', version.createdBy);
            expect(metadata).toHaveProperty('createdAt', version.createdAt);
            expect(metadata).toHaveProperty('recipeId', version.recipeId);
            expect(metadata).not.toHaveProperty('compiledPlan');
            expect(metadata).not.toHaveProperty('paramSnapshot');
        }), { numRuns: 100 });
    });
});
// ── Property 17: Workflow Lifecycle State Machine ──
describe('Feature: workflow-management-api, Property 17: Workflow Lifecycle State Machine', () => {
    const validPairs = new Set([
        'DRAFT:PUBLISHED',
        'DRAFT:ARCHIVED',
        'PUBLISHED:PAUSED',
        'PAUSED:PUBLISHED',
        'PAUSED:ARCHIVED',
    ]);
    it('returns true if and only if the pair is one of the five valid transitions', () => {
        fc.assert(fc.property(arbWorkflowStatus, arbWorkflowStatus, (from, to) => {
            const result = isValidTransition(from, to);
            const expected = validPairs.has(`${from}:${to}`);
            expect(result).toBe(expected);
        }), { numRuns: 100 });
    });
    it('always returns false for transitions from ARCHIVED', () => {
        fc.assert(fc.property(arbWorkflowStatus, (to) => {
            expect(isValidTransition('ARCHIVED', to)).toBe(false);
        }), { numRuns: 100 });
    });
});
// ── Property 1: Create Workflow Request Validation ──
describe('Feature: workflow-management-api, Property 1: Create Workflow Request Validation', () => {
    const arbValidName = fc.string({ minLength: 1 }).filter((s) => s.trim() !== '');
    const arbValidRecipeId = fc.string({ minLength: 1 }).filter((s) => s.trim() !== '');
    const arbValidEnv = fc.constantFrom('dev', 'prod');
    const arbValidConnectionIds = fc.array(fc.string());
    it('accepts bodies with all required fields valid', () => {
        fc.assert(fc.property(arbValidName, arbValidRecipeId, arbValidEnv, arbValidConnectionIds, (name, recipeId, environmentId, connectionIds) => {
            const result = validateCreateRequest({ name, recipeId, environmentId, connectionIds });
            expect(result).toBeNull();
        }), { numRuns: 100 });
    });
    it('rejects bodies with missing or empty name', () => {
        const arbBadName = fc.oneof(fc.constant(''), fc.constant(null), fc.constant(undefined), fc.integer(), fc.boolean());
        fc.assert(fc.property(arbBadName, arbValidRecipeId, arbValidEnv, arbValidConnectionIds, (name, recipeId, environmentId, connectionIds) => {
            expect(validateCreateRequest({ name, recipeId, environmentId, connectionIds })).not.toBeNull();
        }), { numRuns: 100 });
    });
    it('rejects bodies with missing or empty recipeId', () => {
        const arbBadRecipeId = fc.oneof(fc.constant(''), fc.constant(null), fc.constant(undefined), fc.integer());
        fc.assert(fc.property(arbValidName, arbBadRecipeId, arbValidEnv, arbValidConnectionIds, (name, recipeId, environmentId, connectionIds) => {
            expect(validateCreateRequest({ name, recipeId, environmentId, connectionIds })).not.toBeNull();
        }), { numRuns: 100 });
    });
    it('rejects bodies with invalid environmentId', () => {
        const arbBadEnv = fc.string().filter((s) => s !== 'dev' && s !== 'prod');
        fc.assert(fc.property(arbValidName, arbValidRecipeId, arbBadEnv, arbValidConnectionIds, (name, recipeId, environmentId, connectionIds) => {
            expect(validateCreateRequest({ name, recipeId, environmentId, connectionIds })).not.toBeNull();
        }), { numRuns: 100 });
    });
    it('rejects bodies with non-array connectionIds', () => {
        const arbBadConnectionIds = fc.oneof(fc.constant(null), fc.constant(undefined), fc.string(), fc.integer());
        fc.assert(fc.property(arbValidName, arbValidRecipeId, arbValidEnv, arbBadConnectionIds, (name, recipeId, environmentId, connectionIds) => {
            expect(validateCreateRequest({ name, recipeId, environmentId, connectionIds })).not.toBeNull();
        }), { numRuns: 100 });
    });
    it('rejects non-object bodies', () => {
        const arbNonObject = fc.oneof(fc.constant(null), fc.string(), fc.integer(), fc.boolean(), fc.array(fc.string()));
        fc.assert(fc.property(arbNonObject, (body) => {
            expect(validateCreateRequest(body)).not.toBeNull();
        }), { numRuns: 100 });
    });
});
// ── Property 2: Connection Status Validation ──
describe('Feature: workflow-management-api, Property 2: Connection Status Validation', () => {
    it('accepts when every requested connectionId exists and is active', () => {
        fc.assert(fc.property(fc.array(arbId, { minLength: 1, maxLength: 5 }), (ids) => {
            const connections = ids.map((id) => ({
                connectionId: id,
                tenantId: 'tenant-1',
                status: 'active',
                secretRef: `arn:secret:${id}`,
            }));
            expect(validateConnections(connections, ids)).toBeNull();
        }), { numRuns: 100 });
    });
    it('rejects when a requested connectionId is missing', () => {
        fc.assert(fc.property(fc.array(arbId, { maxLength: 5 }), arbId, (presentIds, missingId) => {
            fc.pre(!presentIds.includes(missingId));
            const connections = presentIds.map((id) => ({
                connectionId: id,
                tenantId: 'tenant-1',
                status: 'active',
                secretRef: `arn:secret:${id}`,
            }));
            expect(validateConnections(connections, [missingId])).not.toBeNull();
        }), { numRuns: 100 });
    });
    it('rejects when a requested connection has non-active status', () => {
        const arbInactiveStatus = fc.constantFrom('error', 'pending', 'deleted');
        fc.assert(fc.property(arbId, arbInactiveStatus, (id, status) => {
            const connections = [{ connectionId: id, tenantId: 'tenant-1', status, secretRef: 'arn' }];
            expect(validateConnections(connections, [id])).not.toBeNull();
        }), { numRuns: 100 });
    });
    it('accepts empty request set with any connections', () => {
        fc.assert(fc.property(fc.array(arbConnection, { maxLength: 5 }), (connections) => {
            expect(validateConnections(connections, [])).toBeNull();
        }), { numRuns: 100 });
    });
});
//# sourceMappingURL=logic.property.test.js.map