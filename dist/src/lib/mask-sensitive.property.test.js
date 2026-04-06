import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { maskSensitiveFields } from '../../app/lib/mask-sensitive';
describe('maskSensitiveFields — property-based tests', () => {
    it('masking is idempotent after JSON round-trip', () => {
        fc.assert(fc.property(fc.jsonValue(), (obj) => {
            // First mask pass
            const firstMask = maskSensitiveFields(obj);
            // Serialize and deserialize (JSON round-trip)
            const roundTripped = JSON.parse(JSON.stringify(firstMask));
            // Second mask pass
            const secondMask = maskSensitiveFields(roundTripped);
            // The second mask should produce an equivalent result to the first mask
            expect(JSON.stringify(secondMask)).toBe(JSON.stringify(firstMask));
        }));
    });
    it('masking never introduces new keys', () => {
        fc.assert(fc.property(fc.object(), (obj) => {
            const result = maskSensitiveFields(obj);
            const originalKeys = Object.keys(obj);
            const resultKeys = Object.keys(result);
            expect(resultKeys).toEqual(originalKeys);
        }));
    });
    it('masking preserves the structure of non-sensitive values', () => {
        // Generate objects whose keys are guaranteed to not match the sensitive pattern
        fc.assert(fc.property(fc.record({
            username: fc.string(),
            email: fc.string(),
            age: fc.nat(),
            active: fc.boolean(),
        }), (obj) => {
            const result = maskSensitiveFields(obj);
            expect(result.username).toBe(obj.username);
            expect(result.email).toBe(obj.email);
            expect(result.age).toBe(obj.age);
            expect(result.active).toBe(obj.active);
        }));
    });
    it('original object is never mutated by masking', () => {
        fc.assert(fc.property(fc.object(), (obj) => {
            const snapshot = JSON.stringify(obj);
            maskSensitiveFields(obj);
            expect(JSON.stringify(obj)).toBe(snapshot);
        }));
    });
    it('primitives pass through unchanged', () => {
        fc.assert(fc.property(fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)), (primitive) => {
            expect(maskSensitiveFields(primitive)).toBe(primitive);
        }));
    });
});
//# sourceMappingURL=mask-sensitive.property.test.js.map