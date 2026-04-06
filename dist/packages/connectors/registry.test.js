import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { connectorRegistry, resolveConnector } from './registry.js';
describe('connector registry', () => {
    it('resolves the education standards connectors', () => {
        expect(connectorRegistry.oneroster).toBeDefined();
        expect(connectorRegistry['lti-provision']).toBeDefined();
        expect(resolveConnector('oneroster')).toBe(connectorRegistry.oneroster);
        expect(resolveConnector('lti-provision')).toBe(connectorRegistry['lti-provision']);
    });
    it('property 8: unknown connector errors include the requested key', () => {
        fc.assert(fc.property(fc.string({ minLength: 1, maxLength: 40 }), (key) => {
            fc.pre(!['http', 'oneroster', 'lti-provision'].includes(key));
            expect(() => resolveConnector(key)).toThrowError(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        }));
    });
});
//# sourceMappingURL=registry.test.js.map