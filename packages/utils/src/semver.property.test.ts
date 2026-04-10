import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { bumpMinor, bumpPatch, compareSemver, parseSemver } from './semver';

// ── Arbitrary: valid semver triple ──

const arbSemverTuple = fc.tuple(
  fc.nat({ max: 100 }),
  fc.nat({ max: 100 }),
  fc.nat({ max: 100 }),
);

const arbSemver = arbSemverTuple.map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

// ── Property 7: Semver Round-Trip ──

describe('Feature: workflow-management-api, Property 7: Semver Round-Trip', () => {
  it('formatting then parsing a semver tuple produces the original tuple', () => {
    fc.assert(
      fc.property(arbSemverTuple, ([major, minor, patch]) => {
        const formatted = `${major}.${minor}.${patch}`;
        const parsed = parseSemver(formatted);
        expect(parsed[0]).toBe(major);
        expect(parsed[1]).toBe(minor);
        expect(parsed[2]).toBe(patch);
      }),
      { numRuns: 100 },
    );
  });
});

// ── Property 8: Semver Comparison Total Order ──

describe('Feature: workflow-management-api, Property 8: Semver Comparison Total Order', () => {
  it('compareSemver(v, v) returns 0 (reflexive)', () => {
    fc.assert(
      fc.property(arbSemver, (v) => {
        expect(compareSemver(v, v)).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  it('compareSemver(a, b) equals -compareSemver(b, a) (antisymmetric)', () => {
    fc.assert(
      fc.property(arbSemver, arbSemver, (a, b) => {
        expect(compareSemver(a, b)).toBe(-compareSemver(b, a));
      }),
      { numRuns: 100 },
    );
  });

  it('is transitive: a <= b and b <= c implies a <= c', () => {
    fc.assert(
      fc.property(arbSemver, arbSemver, arbSemver, (a, b, c) => {
        if (compareSemver(a, b) <= 0 && compareSemver(b, c) <= 0) {
          expect(compareSemver(a, c)).toBeLessThanOrEqual(0);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ── Property 9: bumpMinor Correctness ──

describe('Feature: workflow-management-api, Property 9: bumpMinor Correctness', () => {
  it('bumpMinor returns major.(minor+1).0', () => {
    fc.assert(
      fc.property(arbSemverTuple, ([major, minor]) => {
        const v = `${major}.${minor}.99`;
        expect(bumpMinor(v)).toBe(`${major}.${minor + 1}.0`);
      }),
      { numRuns: 100 },
    );
  });

  it('bumpMinor(v) is greater than v', () => {
    fc.assert(
      fc.property(arbSemver, (v) => {
        expect(compareSemver(bumpMinor(v), v)).toBe(1);
      }),
      { numRuns: 100 },
    );
  });
});

// ── Property 10: bumpPatch Correctness ──

describe('Feature: workflow-management-api, Property 10: bumpPatch Correctness', () => {
  it('bumpPatch returns major.minor.(patch+1)', () => {
    fc.assert(
      fc.property(arbSemverTuple, ([major, minor, patch]) => {
        const v = `${major}.${minor}.${patch}`;
        expect(bumpPatch(v)).toBe(`${major}.${minor}.${patch + 1}`);
      }),
      { numRuns: 100 },
    );
  });

  it('bumpPatch(v) is greater than v', () => {
    fc.assert(
      fc.property(arbSemver, (v) => {
        expect(compareSemver(bumpPatch(v), v)).toBe(1);
      }),
      { numRuns: 100 },
    );
  });
});

// ── Property 11: Invalid Semver Rejection ──

describe('Feature: workflow-management-api, Property 11: Invalid Semver Rejection', () => {
  it('parseSemver throws for strings not matching digits.digits.digits', () => {
    const arbInvalidSemver = fc.string().filter((s) => !/^\d+\.\d+\.\d+$/.test(s.trim()));
    fc.assert(
      fc.property(arbInvalidSemver, (s) => {
        expect(() => parseSemver(s)).toThrow();
      }),
      { numRuns: 100 },
    );
  });
});
