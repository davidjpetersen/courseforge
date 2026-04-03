# Requirements Document

## Introduction

The Recipe Library is the primary entry point for CourseForge Connect users to discover, configure, and activate pre-built education workflow automations. It provides a browsable catalog of curated, education-certified workflow templates ("recipes"), a guided wizard for configuring and publishing workflows from those templates, and search/filter capabilities to help users find the right template quickly. The goal is to enable an LMS Admin or Instructional Designer to go from zero to a running workflow in under 10 minutes, with no code required.

This document covers P0 stories (Browse Template Library, Guided Recipe Wizard) and P1 (Filter and Search Templates). Partner template submission (P2) is noted as future scope. The visual canvas editor (P3) is explicitly out of scope for MVP.

## Glossary

- **Recipe_Library**: The browsable catalog UI that displays available workflow templates organized by category.
- **Template**: A curated, pre-built workflow definition that can be configured and activated by a user. Each template belongs to a category and may carry certification tags.
- **Category**: A classification for templates. MVP categories are Roster Ops, Course Lifecycle, Notifications, and Analytics. The Assessment category is available for filtering.
- **Recipe_Wizard**: The step-by-step guided configuration interface that walks a user through parameterizing and activating a template into a running workflow.
- **Workflow**: A configured and published instance of a template, orchestrated by Step Functions and registered in the workflow registry (DynamoDB).
- **Education_Standard_Tag**: A label indicating which education data standards (e.g., SIS, LTI, OneRoster, xAPI) a template interacts with.
- **Connected_System**: An external system (LMS, SIS, notification service, analytics platform) that a template integrates with.
- **Time_To_Activate**: The estimated duration for a user to configure and publish a template into a running workflow.
- **Tenant**: An isolated organizational account within CourseForge Connect.
- **LMS_Admin**: A persona responsible for managing learning platform integrations and automations.
- **Instructional_Designer**: A persona who designs learning experiences and configures course-related workflows.
- **Workflow_DSL**: The CourseForge workflow domain-specific language that sits above the execution layer (Step Functions, Lambda, ECS).
- **Run**: A single execution instance of a published workflow.

## Requirements

### Requirement 1: Display Template Library Catalog

**User Story:** As an LMS Admin, I want to browse a catalog of curated education-certified workflow templates organized by category, so that I can discover automations relevant to my institution's needs.

#### Acceptance Criteria

1. WHEN the LMS_Admin navigates to the Recipe_Library, THE Recipe_Library SHALL display all available templates grouped by Category.
2. THE Recipe_Library SHALL organize templates into the following categories: Roster Ops, Course Lifecycle, Notifications, and Analytics.
3. FOR EACH displayed Template, THE Recipe_Library SHALL show the template name, description, list of Connected_Systems, Time_To_Activate estimate, and Education_Standard_Tags.
4. WHEN the Recipe_Library page is requested, THE Recipe_Library SHALL render the complete template catalog within 2 seconds.
5. THE Recipe_Library SHALL display at least 3 education-certified starter templates at launch: one for Roster Ops, one for Course Lifecycle, and one for Notifications.
6. WHEN a Template belongs to multiple categories, THE Recipe_Library SHALL display that Template under each applicable Category.

### Requirement 2: Template Detail View

**User Story:** As an LMS Admin, I want to view detailed information about a template before configuring it, so that I can evaluate whether the template fits my use case.

#### Acceptance Criteria

1. WHEN the LMS_Admin selects a Template from the catalog, THE Recipe_Library SHALL display a detail view containing the template name, full description, list of Connected_Systems, required parameters, Time_To_Activate estimate, Education_Standard_Tags, and a count of configuration steps.
2. THE Recipe_Library detail view SHALL include an action to begin configuring the selected Template via the Recipe_Wizard.
3. IF the selected Template requires a Connected_System that the Tenant has not yet configured, THEN THE Recipe_Library SHALL indicate which connections are missing.

### Requirement 3: Guided Recipe Wizard — Step-by-Step Configuration

**User Story:** As an Instructional Designer, I want a step-by-step wizard to configure a workflow template, so that I can activate an automation without writing code and within 10 minutes.

#### Acceptance Criteria

1. WHEN the user initiates configuration of a Template, THE Recipe_Wizard SHALL present a sequential, step-by-step interface collecting only the parameters required by that Template.
2. FOR EACH step in the Recipe_Wizard, THE Recipe_Wizard SHALL display inline help text explaining the purpose and expected format of each parameter.
3. THE Recipe_Wizard SHALL display a progress indicator showing the current step number relative to the total number of steps.
4. WHEN the user completes all required parameters, THE Recipe_Wizard SHALL enable a publish action to activate the configured workflow.
5. THE Recipe_Wizard SHALL allow the user to navigate backward to any previously completed step without losing entered data.

### Requirement 4: Wizard Field Validation

**User Story:** As an Instructional Designer, I want the wizard to validate my inputs before publishing, so that I can fix errors early and avoid failed workflow activations.

#### Acceptance Criteria

1. WHEN the user attempts to advance to the next step, THE Recipe_Wizard SHALL validate all required fields on the current step and prevent advancement if any field is invalid.
2. IF a field value fails validation, THEN THE Recipe_Wizard SHALL display a specific, actionable error message adjacent to the invalid field.
3. WHEN the user triggers the publish action, THE Recipe_Wizard SHALL perform a final validation of all parameters across all steps before submitting.
4. IF the final validation detects errors, THEN THE Recipe_Wizard SHALL navigate the user to the first step containing an error and highlight the invalid fields.

### Requirement 5: Test Individual Wizard Steps

**User Story:** As an Instructional Designer, I want to test each step of my workflow configuration before publishing, so that I can verify correctness incrementally.

#### Acceptance Criteria

1. FOR EACH configuration step that interacts with a Connected_System, THE Recipe_Wizard SHALL provide a "Test this step" action.
2. WHEN the user triggers "Test this step", THE Recipe_Wizard SHALL execute a dry-run validation of that step's configuration against the target Connected_System and return a pass or fail result.
3. IF the step test fails, THEN THE Recipe_Wizard SHALL display the failure reason and suggest corrective actions.
4. WHILE a step test is executing, THE Recipe_Wizard SHALL display a loading indicator and disable the "Test this step" action to prevent duplicate submissions.

### Requirement 6: Publish Workflow from Wizard

**User Story:** As an Instructional Designer, I want to publish my configured workflow so that it becomes active and begins processing events.

#### Acceptance Criteria

1. WHEN the user confirms the publish action and all validations pass, THE Recipe_Wizard SHALL create a Workflow record in the workflow registry, generate the Workflow_DSL definition, and activate the orchestration pipeline.
2. WHEN the workflow is published successfully, THE Recipe_Wizard SHALL display a confirmation screen with the workflow name, status, and a link to monitor the first Run.
3. IF the publish operation fails, THEN THE Recipe_Wizard SHALL display the error details and allow the user to retry without re-entering configuration data.
4. THE Recipe_Wizard SHALL associate the published Workflow with the originating Template and the current Tenant.

### Requirement 7: Filter Templates by Category

**User Story:** As an LMS Admin, I want to filter the template catalog by category, so that I can narrow down templates relevant to a specific operational area.

#### Acceptance Criteria

1. THE Recipe_Library SHALL provide filter controls for the following categories: Roster Ops, Course Lifecycle, Notifications, Analytics, and Assessment.
2. WHEN the LMS_Admin selects one or more Category filters, THE Recipe_Library SHALL display only templates matching the selected categories.
3. WHEN the LMS_Admin clears all Category filters, THE Recipe_Library SHALL display the full template catalog.
4. THE Recipe_Library SHALL persist the selected filter state for the duration of the user's session.
5. WHEN the user returns to the Recipe_Library within the same session, THE Recipe_Library SHALL restore the previously selected filters.

### Requirement 8: Full-Text Search Across Templates

**User Story:** As an LMS Admin, I want to search templates by keyword, so that I can find a specific template by name or description without browsing every category.

#### Acceptance Criteria

1. THE Recipe_Library SHALL provide a search input that accepts free-text queries.
2. WHEN the LMS_Admin enters a search query, THE Recipe_Library SHALL perform full-text search across template names and descriptions and display matching results.
3. WHEN the LMS_Admin applies both a search query and Category filters, THE Recipe_Library SHALL display only templates matching both the search query and the selected categories.
4. WHEN the search query and active filters produce zero results, THE Recipe_Library SHALL display a zero-results message with suggested alternative search terms or categories.
5. WHEN the LMS_Admin clears the search input, THE Recipe_Library SHALL revert to displaying templates based on the active Category filters, or the full catalog if no filters are active.

### Requirement 9: Wizard Configuration Serialization (Round-Trip)

**User Story:** As a developer, I want wizard configurations to serialize and deserialize reliably, so that saved drafts and published workflows faithfully represent the user's input.

#### Acceptance Criteria

1. THE Recipe_Wizard SHALL serialize the user's configuration parameters into a Workflow_DSL definition.
2. THE Recipe_Wizard SHALL deserialize a Workflow_DSL definition back into editable wizard parameters.
3. FOR ALL valid wizard configurations, serializing to Workflow_DSL and then deserializing back SHALL produce a configuration equivalent to the original input (round-trip property).
4. IF the Recipe_Wizard encounters a malformed Workflow_DSL definition during deserialization, THEN THE Recipe_Wizard SHALL return a descriptive error identifying the invalid section.

---

## Future Scope (P2)

### Partner Template Submission (S21)

Partner template submission will allow EdTech Builders to submit custom templates with name, description, category, step definitions, and passing test results. Submitted templates will enter a review queue before public listing. Partner templates will carry a distinct "Partner" badge separate from "CourseForge Certified". Partners will be able to update or withdraw templates through a developer portal. This is deferred to a future iteration.

## Out of Scope

- **Visual Canvas Workflow Editor (S27 / P3)**: The MVP uses a form-driven Recipe Wizard only. A drag-and-drop visual canvas editor is explicitly excluded from this release.
