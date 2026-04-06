# Implementation Plan: Education Standards Connectors

## Overview

The OneRoster and LTI Provision connectors are already implemented along with the connector registry. This plan focuses on creating property-based tests (using fast-check) for the 8 correctness properties defined in the design, adding a registry unit test file, and verifying existing unit test coverage.

## Tasks

- [ ] 1. Create OneRoster property tests (P1–P5)
  - [ ] 1.1 Create `packages/connectors/oneroster/index.property.test.ts` with property test for P1: Delta filter URL construction
    - Use fast-check to generate random base URLs and optional ISO 8601 timestamps
    - Verify `buildEnrollmentsUrl(baseUrl, since)` produces a URL with `filter=dateLastModified>'{since}'` when since is provided, and no filter param when undefined
    - **Property 1: Delta filter URL construction**
    - **Validates: Requirements 3.1, 3.2**

  - [ ] 1.2 Add property test for P2: Org filtering preserves only matching records
    - Generate random arrays of enrollment objects with varying `schoolSourcedId` values and a random `targetOrgId`
    - Verify filtering produces only records matching `targetOrgId` and no matching records are lost
    - **Property 2: Org filtering preserves only matching records**
    - **Validates: Requirements 3.4**

  - [ ] 1.3 Add property test for P3: User batching invariants
    - Generate random string arrays with duplicates and empty strings
    - Extract the batching logic (dedup, split into chunks of 50) and verify: each batch ≤ 50 elements, union of batches equals set of unique non-empty IDs
    - **Property 3: User batching invariants**
    - **Validates: Requirements 4.1, 4.2**

  - [ ] 1.4 Add property test for P4: Field mapping correctness
    - Generate random records (objects with string keys) and random FieldMapping arrays
    - Verify `applyFieldMappings` output keys are exactly the targetFields whose sourceField exists on input, values match, and no extra keys
    - **Property 4: Field mapping correctness**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

  - [ ] 1.5 Add property test for P5: Error threshold behavior
    - Generate random (total, errorCount) pairs where errorCount ≤ total
    - Verify: when total > 0 and errorCount/total > 0.2, `BatchSyncThresholdError` is thrown with correct rate and total; otherwise no error
    - **Property 5: Error threshold behavior**
    - **Validates: Requirements 7.1, 7.2, 7.3**

- [ ] 2. Checkpoint — Run OneRoster property tests
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 3. Create LTI Provision property tests (P6–P7)
  - [ ] 3.1 Create `packages/connectors/lti-provision/index.property.test.ts` with property test for P6: D2L signature computation
    - Generate random (apiKey, secret, path) string triples
    - Verify `createD2LSignature(apiKey, secret, path)` returns `Buffer.from(\`${apiKey}:${secret}:${path}\`).toString('base64url')`
    - Note: `createD2LSignature` is not exported — either export it or inline the logic for testing
    - **Property 6: D2L signature computation**
    - **Validates: Requirements 11.2**

  - [ ] 3.2 Add property test for P7: LMS error normalization
    - Generate random HTTP status codes, LMS types (canvas, blackboard, brightspace), and JSON/non-JSON response bodies
    - Verify `parseLmsError` extracts LMS-specific fields into normalized `LtiError` for valid JSON, and falls back to HTTP status + default message for invalid JSON
    - **Property 7: LMS error normalization**
    - **Validates: Requirements 12.1, 12.2, 12.3, 12.4**

- [ ] 4. Create registry tests with P8
  - [ ] 4.1 Create `packages/connectors/registry.test.ts` with unit tests verifying 'oneroster' and 'lti-provision' entries exist in the registry
    - Verify `resolveConnector('oneroster')` and `resolveConnector('lti-provision')` return connector objects
    - _Requirements: 13.1, 13.2_

  - [ ] 4.2 Add property test for P8: Unknown connector key error contains key
    - Generate random strings that are not 'http', 'oneroster', or 'lti-provision'
    - Verify `resolveConnector(key)` throws an error whose message contains the unknown key
    - **Property 8: Unknown connector key error contains key**
    - **Validates: Requirements 13.3**

- [ ] 5. Final checkpoint — Run all connector tests
  - Run `vitest --run packages/connectors/` and ensure all unit and property tests pass, ask the user if questions arise.
