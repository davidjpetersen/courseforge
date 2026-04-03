# Tasks — Recipe Library

## Task 1: Data Models & DynamoDB Schema

- [x] 1.1 Define Template DynamoDB table schema with single-table design (PK, SK, attributes)
- [x] 1.2 Create CategoryIndex GSI (GSI1PK: CATEGORY#{categoryName}, GSI1SK: TEMPLATE#{templateId})
- [x] 1.3 Define Workflow table extension schema (PK: TENANT#{tenantId}, SK: WORKFLOW#{workflowId})
- [x] 1.4 Create TypeScript interfaces for Template, StepDefinition, FieldDefinition, WizardConfiguration, WorkflowDSL
- [x] 1.5 Seed at least 3 education-certified starter templates (Roster Ops, Course Lifecycle, Notifications)

## Task 2: DSL Serialization & Deserialization

- [x] 2.1 Implement `serializeConfig(config, metadata)` function that converts WizardConfiguration to WorkflowDSL JSON
- [x] 2.2 Implement `deserializeConfig(dsl)` function that converts WorkflowDSL JSON back to WizardConfiguration
- [x] 2.3 Implement malformed DSL error handling with descriptive error messages identifying invalid sections
- [x] 2.4 Write property test: DSL round-trip (Property 1) — `Feature: recipe-library, Property 1: DSL Serialization Round-Trip`
- [x] 2.5 Write property test: Malformed DSL error (Property 15) — `Feature: recipe-library, Property 15: Malformed DSL Produces Descriptive Error`
- [x] 2.6 Write unit tests for serialization edge cases (minimal config, maximal config, missing fields, wrong types)

## Task 3: Template API (Backend)

- [x] 3.1 Implement `GET /templates` Lambda handler — query DynamoDB, support optional `?category=` filter
- [x] 3.2 Implement `GET /templates/{templateId}` Lambda handler — fetch full template detail including steps
- [x] 3.3 Implement missing connection detection logic (set difference: template.connectedSystems − tenant.configuredConnections)
- [x] 3.4 Write property test: Category filtering (Property 12) — `Feature: recipe-library, Property 12: Category Filtering Returns Correct Subset`
- [x] 3.5 Write property test: Missing connection detection (Property 4) — `Feature: recipe-library, Property 4: Missing Connection Detection`
- [x] 3.6 Write unit tests for template API edge cases (empty catalog, template not found, multi-category templates)

## Task 4: Search API (Backend)

- [x] 4.1 Set up DynamoDB Streams → OpenSearch Serverless index pipeline for template data
- [x] 4.2 Implement `GET /search?q={query}&category={categories}` Lambda handler — query OpenSearch with optional category filter
- [x] 4.3 Implement zero-results suggestion logic (alternative search terms or category suggestions)
- [x] 4.4 Write property test: Combined search and filter intersection (Property 14) — `Feature: recipe-library, Property 14: Combined Search and Filter Returns Intersection`
- [x] 4.5 Write unit tests for search edge cases (empty query, special characters, zero results)

## Task 5: Template Catalog UI

- [x] 5.1 Build `TemplateCatalog` component — fetches templates, renders grouped by category
- [x] 5.2 Build `TemplateCard` component — displays name, description, connected systems, time-to-activate, tags
- [x] 5.3 Build `TemplateDetail` component — full info, missing connection warnings, "Configure" CTA
- [x] 5.4 Implement template grouping logic (templates with multiple categories appear under each)
- [x] 5.5 Write property test: Template grouping by category (Property 2) — `Feature: recipe-library, Property 2: Template Grouping by Category`
- [x] 5.6 Write property test: Template view renders required fields (Property 3) — `Feature: recipe-library, Property 3: Template View Renders Required Fields`

## Task 6: Filter & Search UI

- [x] 6.1 Build `FilterBar` component — multi-select category checkboxes (Roster Ops, Course Lifecycle, Notifications, Analytics, Assessment)
- [x] 6.2 Build `SearchInput` component — debounced text input, triggers search API, clears to filter-only view
- [x] 6.3 Implement filter state persistence to session storage (save on change, restore on mount)
- [x] 6.4 Implement zero-results UI with suggested alternatives
- [x] 6.5 Write property test: Filter state session round-trip (Property 13) — `Feature: recipe-library, Property 13: Filter State Session Round-Trip`
- [x] 6.6 Write unit tests for filter/search UI edge cases (clear all filters, clear search, session storage unavailable)

## Task 7: Recipe Wizard — Core Navigation & State

- [x] 7.1 Build `RecipeWizard` container component — multi-step form, step navigation, progress indicator
- [x] 7.2 Build `WizardStep` component — renders fields for a single step with inline help text
- [x] 7.3 Implement wizard state management (client-side, session storage backed)
- [x] 7.4 Implement backward/forward navigation with data preservation
- [x] 7.5 Write property test: Wizard renders correct steps and fields (Property 5) — `Feature: recipe-library, Property 5: Wizard Renders Correct Steps and Fields`
- [x] 7.6 Write property test: Progress indicator accuracy (Property 6) — `Feature: recipe-library, Property 6: Progress Indicator Accuracy`
- [x] 7.7 Write property test: Backward navigation preserves data (Property 7) — `Feature: recipe-library, Property 7: Backward Navigation Preserves Data`

## Task 8: Wizard Validation

- [x] 8.1 Implement per-step field validation (required check, pattern matching, min/max, type validation)
- [x] 8.2 Implement cross-step validation (validate all steps on publish trigger)
- [x] 8.3 Implement first-error-step navigation logic
- [x] 8.4 Build `ValidationSummary` component — error display with navigation to error step
- [x] 8.5 Write property test: Validation identifies all invalid fields (Property 8) — `Feature: recipe-library, Property 8: Validation Identifies All Invalid Fields with Error Messages`
- [x] 8.6 Write property test: Cross-step validation navigates to first error (Property 9) — `Feature: recipe-library, Property 9: Cross-Step Validation Navigates to First Error`
- [x] 8.7 Write property test: Publish enabled logic (Property 16) — `Feature: recipe-library, Property 16: Publish Enabled Only When All Required Fields Valid`
- [x] 8.8 Write unit tests for validation edge cases (empty strings, whitespace, boundary values, pattern mismatches)

## Task 9: Step Testing

- [x] 9.1 Implement `POST /steps/{stepId}/test` Lambda handler — dry-run validation against connected system
- [x] 9.2 Build `StepTestButton` component — loading state, pass/fail display, failure reason and suggested fix
- [x] 9.3 Implement test button visibility logic (show only for steps with connectedSystem reference)
- [x] 9.4 Write property test: Test button presence matches connected system (Property 10) — `Feature: recipe-library, Property 10: Test Button Presence Matches Connected System`
- [x] 9.5 Write unit tests for step test edge cases (timeout, duplicate submission prevention, failure display)

## Task 10: Publish Workflow

- [x] 10.1 Implement `POST /workflows` Lambda handler — trigger Step Functions publish pipeline
- [x] 10.2 Create Step Functions state machine: validate → generate DSL → create Workflow record → activate pipeline → emit EventBridge event
- [x] 10.3 Build `PublishConfirmation` component — workflow name, status, monitoring link
- [x] 10.4 Implement publish error handling — display error details, preserve wizard state for retry
- [x] 10.5 Write property test: Publish confirmation contains required fields (Property 11) — `Feature: recipe-library, Property 11: Publish Confirmation Contains Required Fields`
- [x] 10.6 Write unit tests for publish edge cases (publish failure retry, workflow-template-tenant association)

## Task 11: Integration Tests

- [x] 11.1 End-to-end wizard flow: select template → configure → test step → publish → verify workflow record
- [x] 11.2 Search integration: index templates → search → verify results
- [x] 11.3 Publish pipeline integration: submit → verify Step Functions → verify DynamoDB → verify EventBridge
