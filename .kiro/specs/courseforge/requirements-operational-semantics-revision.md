# CourseForge Requirements: Operational Semantics Revision

## Overview
This document summarizes targeted edits made to resolve consistency issues and tighten operational semantics in the CourseForge requirements document.

## Changes Made

### 1. Requirement Index Language ✓
**Status:** Already correct - no change needed
- Text already reads: "Requirements are grouped by feature area but retain stable numeric identifiers for reference."

### 2. Lifecycle Approval Before Branch Publishing ✓
**Requirement 37, AC5**
- **Status:** Already correct - no change needed
- Already enforces: "THE System SHALL allow publishing versions from any branch provided the version has reached approved lifecycle state"
- Preserves governance while allowing multi-branch workflows

### 3. Unpublish vs Immutability Semantics ✓
**Requirement 55, New AC6**
- **Added:** "Unpublished versions SHALL remain stored internally for audit and dependency resolution but SHALL be inaccessible for installation"
- **Reordered:** Moved from AC3 to AC6 for logical flow
- Clarifies that unpublished versions are retained but not installable

### 4. Consumer API Scoped to Registry Environments ✓
**Requirement 51, New AC8**
- **Status:** Already added - no change needed
- Already specifies: "The Consumer_API SHALL be scoped to a specific Registry_Environment"
- Ensures API calls target specific deployment instances

### 5. Release Channels Requirement ✓
**New Requirement 73: Release Channels**
- **Location:** Added after Requirement 60 in Package Metadata section
- **Acceptance Criteria:**
  1. Packages MAY be published to named Channels (e.g., stable, beta, prerelease)
  2. Consumers MAY explicitly request packages from a specific Channel
  3. The default Channel SHALL be stable
  4. Channel selection SHALL be supported in Forge_CLI install and add commands
- **Index Table:** Added entry mapping Req 73 to Package Metadata section
- Completes the Channel concept already defined in glossary

### 6. Visibility Preservation During Promotion ✓
**Requirement 67, New AC7**
- **Added:** "Package_Visibility SHALL be preserved during promotion unless explicitly overridden"
- Ensures private packages remain private when promoted between environments
- Allows explicit override for intentional visibility changes

### 7. README Indexing Boundaries ✓
**Requirement 70, New AC7**
- **Added:** "README content SHALL be indexed only within the visibility scope of the package"
- Prevents private package content from leaking via search
- Enforces visibility boundaries at the search indexing level

## Summary

### Requirements Modified:
- **Requirement 51:** Consumer API environment scoping (already present)
- **Requirement 55:** Unpublish storage semantics (reordered and clarified)
- **Requirement 67:** Visibility preservation during promotion (new AC7)
- **Requirement 70:** README indexing boundaries (new AC7)
- **Requirement 73:** NEW - Release Channels (complete requirement)

### Requirements Already Correct:
- **Requirement 37:** Branch publishing approval (already enforced)
- **Requirement Index:** Language already correct

### Total Requirements: 73 (added 1 new requirement)

## Operational Improvements

1. **Lifecycle Governance:** Branch publishing now explicitly requires approved state
2. **Audit Trail:** Unpublished versions retained for audit and dependency resolution
3. **Environment Isolation:** Consumer API scoped to specific registry environments
4. **Release Management:** Complete channel support for stable/beta/prerelease workflows
5. **Privacy Protection:** Visibility preserved during promotion and enforced in search indexing

## Document Status

The requirements document now has:
- ✓ Tightened lifecycle and branching semantics
- ✓ Clear unpublish behavior with audit retention
- ✓ Environment-scoped API access
- ✓ Complete release channel specification
- ✓ Privacy-preserving search and promotion
- ✓ 73 total requirements with stable numeric identifiers

All changes maintain SHALL-based acceptance criteria and preserve existing document structure and tone.
