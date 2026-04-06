import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { encodeCursor, decodeCursor, clampLimit } from './validation.js';

describe('Property 2: cursor encode/decode round-trip', () => {
  it('decodeCursor(encodeCursor(obj)) deep-equals obj for any JSON-serializable object', () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.string(),
          fc.oneof(fc.string(), fc.integer(), fc.boolean()),
        ),
        (obj) => {
          const encoded = encodeCursor(obj as Record<string, unknown>);
          const decoded = decodeCursor(encoded);
          // Deep-equal: JSON round-trip should preserve all values
          return JSON.stringify(decoded) === JSON.stringify(obj);
        },
      ),
    );
  });
});

describe('Property 3: clampLimit bounds', () => {
  it('clampLimit(n) is always in [1, 100] for any integer n', () => {
    fc.assert(
      fc.property(fc.integer(), (n) => {
        const result = clampLimit(n);
        return result >= 1 && result <= 100;
      }),
    );
  });
});
