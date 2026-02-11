# CourseForge Requirements Revision Summary

## Overview
This document summarizes all revisions made to the CourseForge requirements document, including structural improvements, command disambiguation, language consistency, and index table corrections.

## All Changes Made

### 1. Command Ambiguity Resolution (Req 13 vs Req 14) ✓
- Added AC6 to Requirement 13 declaring "objective", "assessment", and "experience" as reserved subcommand keywords
- Prevents ambiguity between `forge add <pkg>` and `forge add objective <uri|name>`

### 2. Unpublish and Immutability Reconciliation (Req 45 vs Req 55) ✓
- Updated Requirement 45 AC2 to explicitly reference the 24-hour unpublish window exception from Requirement 55

### 3. First-Person Language Fix (Req 33) ✓
- Rewrote all acceptance criteria in third-person formal language
- Changed "I maintain" to "the maintainer owns", "allow me" to "allow the maintainer"

### 4. Package Name Format Specification (Req 44) ✓
- Expanded AC5 with comprehensive naming rules
- Defined patterns, length limits, and reserved names

### 5. Semantic Search Fallback Behavior (Req 20) ✓
- Added AC7 for graceful degradation to keyword-only search when semantic search fails

### 6. Owner Self-Approval Policy Clarification (Req 34) ✓
- Added AC5 making self-approval configurable per organization
- Added explanatory note documenting this as intentional for solo maintainers

### 7. Requirement Index Table ✓
- Created comprehensive 72-requirement index mapping IDs to titles and sections

### 8. Index Table Section Corrections ✓
- **Requirements 61-66:** Corrected from "Versioning and Lineage" to "CLI (forge) Authoring and Publishing"
- **Requirements 67-68:** Corrected from "Authentication and Access" to "Registry Environments"
- **Requirement 69:** Corrected from "Authentication and Access" to "Cross-Cutting Concerns"
- **Requirement 71:** Corrected from "Package Metadata" to "Cross-Cutting Concerns"
- **Requirement 72:** Corrected from "Package Metadata" to "Cross-Cutting Concerns"

## Document Status

The requirements document is now:
- ✓ Complete with 72 requirements
- ✓ Free of ambiguities
- ✓ Consistent in language and style
- ✓ Well-indexed with accurate section mappings
- ✓ Ready for design phase
