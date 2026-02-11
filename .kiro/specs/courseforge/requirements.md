# Requirements Document: CourseForge

## Introduction

CourseForge is a collaborative registry platform for instructional designers to author, version, and share CTDL-native learning components. Similar to npmjs.com for JavaScript packages, CourseForge enables the creation, discovery, and reuse of instructional packages built on CTDL (Credential Transparency Description Language) and CTDL-ASN (Achievement Standards Network) standards.

The platform consists of three main components:
1. A Next.js web application providing registry browsing, search, and authoring capabilities
2. A CLI tool called "forge" for local authoring and package management
3. A PostgreSQL database with pgvector extension for semantic search capabilities

CourseForge supports three artifact types: Learning Experiences, Objectives (CTDL-ASN aligned), and Assessments, with a canonical dependency model where Learning Experiences depend on Objectives and Assessments, and Assessments depend on Objectives.

## Product Principles

CourseForge is guided by five core principles that shape all implementation decisions:

1. **Objective-First Design**: Learning objectives are the foundation of instructional design. The platform prioritizes objective discovery, alignment, and reuse, making objectives the entry point for building coherent learning experiences.

2. **Composability and Modular Reuse**: Every learning component is a discrete, versioned, reusable package. Instructional designers compose complete learning experiences from modular objectives, assessments, and activities, enabling efficient reuse across contexts.

3. **Standards-Native Architecture**: CTDL and CTDL-ASN are not export formats—they are the native data model. All artifacts are created, stored, and manipulated as standards-compliant JSON-LD, ensuring interoperability and future-proofing.

4. **CLI-First Parity**: The command-line interface is a first-class citizen with feature parity to the web application. Professional workflows, automation, and integration are enabled through a robust CLI that mirrors web capabilities.

5. **Human-in-the-Loop Quality Governance**: Automated validation and quality gates provide guardrails, but human review and approval remain central to the publishing process. The platform supports collaborative review workflows that balance automation with expert judgment.

## Explicit Non-Goals

CourseForge has a focused scope. The following are explicitly out of scope:

- **Not an LMS**: CourseForge does not deliver learner-facing experiences, track learner progress, or manage enrollments.
- **Not a Content Delivery Platform**: CourseForge is a registry for instructional components, not a runtime environment for delivering courses.
- **Not a Replacement for SIS/LMS**: CourseForge complements existing learning systems by providing reusable, standards-based components that can be integrated into those platforms.
- **Not a Credential Issuer**: While CourseForge uses CTDL standards, it does not issue or verify credentials—it provides the building blocks for credential-bearing programs.
- **Not a Learning Analytics Platform**: CourseForge tracks package usage and platform metrics, not learner outcomes or performance data.

## Glossary

- **CTDL**: Credential Transparency Description Language - a standard for describing credentials and learning opportunities as JSON-LD
- **CTDL-ASN**: CTDL Achievement Standards Network - an extension for describing competencies and learning objectives
- **Package**: A versioned, publishable unit containing one or more learning artifacts (Learning Experience, Objective, or Assessment)
- **Learning_Experience**: An instructional activity or course component that helps learners achieve specific objectives
- **Objective**: A CTDL-ASN aligned learning goal or competency statement
- **Assessment**: An evaluation instrument that measures achievement of specific objectives
- **Registry**: The central repository where packages are published and discovered
- **Forge_CLI**: The command-line tool for authoring, building, and publishing packages
- **Manifest**: The forge.json file that describes a package's metadata, dependencies, and configuration
- **Semantic_Search**: Vector-based similarity search using pgvector to find related packages
- **Organization**: A group entity that can own packages and manage teams
- **Team**: A collection of users within an organization with specific access permissions
- **Pull_Request**: A proposed change to a package requiring review and approval
- **Quality_Gate**: A required validation check that must pass before publishing
- **Embedding**: A vector representation of text content used for semantic search
- **Lifecycle_State**: The current status of a package in its publication workflow (draft, under-review, approved, published, deprecated, archived)
- **Registry_Environment**: A deployment instance of the registry (local, staging, production) with independent package catalogs
- **Consumer_API**: A read-only API for retrieving published packages and metadata programmatically
- **Lockfile**: A generated file capturing exact resolved dependency versions for reproducible builds
- **Version_Constraint**: A semantic versioning range specification (e.g., ^1.2.0, ~2.1.0) that defines acceptable dependency versions
- **Orphaned_Package**: A package whose owning organization or user has been deleted, requiring reassignment before modification
- **Package_Visibility**: The access control setting for a package (public, organization-private, team-private)

## Requirements

### CTDL/CTDL-ASN Compliance

### Requirement 1: CTDL/CTDL-ASN Artifact Storage

**User Story:** As an instructional designer, I want all learning artifacts stored as valid CTDL JSON-LD, so that my content is standards-compliant and interoperable with other CTDL-aware systems.

#### Acceptance Criteria

1. THE System SHALL store all Learning_Experience artifacts as valid CTDL JSON-LD documents
2. THE System SHALL store all Objective artifacts as valid CTDL-ASN JSON-LD documents
3. THE System SHALL store all Assessment artifacts as valid CTDL JSON-LD documents
4. WHEN a package is stored, THE System SHALL assign a stable URI to each artifact
5. WHEN a package version is created, THE System SHALL generate a versioned identifier for each artifact
6. THE System SHALL preserve the JSON-LD @context and @type fields for all artifacts

### Requirement 2: CTDL Schema Validation

**User Story:** As a package publisher, I want my artifacts validated against CTDL schemas before publishing, so that I can ensure standards compliance and catch errors early.

#### Acceptance Criteria

1. WHEN a user attempts to publish a package, THE System SHALL validate all artifacts against their respective CTDL schemas
2. IF validation fails, THEN THE System SHALL return descriptive error messages indicating which fields are non-compliant
3. THE System SHALL prevent publication of packages containing invalid CTDL artifacts
4. WHEN validation succeeds, THE System SHALL mark the package as schema-compliant
5. THE System SHALL validate that Objective artifacts conform to CTDL-ASN structure requirements

### Validation Framework

The CourseForge validation framework operates in three distinct contexts, each serving a different purpose in the package lifecycle:

1. **Local CLI Validation**: Provides immediate feedback during authoring without network connectivity. Validates syntax, schema compliance, and local dependency references.

2. **Pre-Publish Validation**: Executes comprehensive checks before a package enters the registry, including remote dependency resolution, URI stability, and metadata completeness.

3. **Quality Gate Validation**: Enforces organizational and platform-wide quality standards as part of the publishing workflow, including accessibility, rubric alignment, and security scanning.

All three contexts share a common validation engine that ensures consistent rule application. The separation of execution contexts allows for progressive validation that balances rapid iteration during authoring with rigorous quality control at publication.

**Command Mapping:**
- `forge validate` runs Local CLI Validation
- `forge publish` triggers Pre-Publish Validation followed by Quality Gate Validation

### Requirement 3: CTDL Import and Export

**User Story:** As an instructional designer, I want to import and export packages as CTDL JSON-LD, so that I can integrate with external CTDL-aware tools and systems.

#### Acceptance Criteria

1. THE System SHALL provide an export function that outputs packages as valid CTDL JSON-LD
2. THE System SHALL provide an import function that accepts valid CTDL JSON-LD documents
3. WHEN exporting a package, THE System SHALL include all artifacts and their relationships
4. WHEN importing a package, THE System SHALL validate the CTDL structure before accepting it
5. THE System SHALL preserve all CTDL metadata during import and export operations

### Dependency Management

### Requirement 4: Canonical Dependency Model

**User Story:** As an instructional designer, I want the system to enforce the canonical dependency model, so that package relationships remain consistent and semantically correct.

#### Acceptance Criteria

1. THE System SHALL allow Learning_Experience packages to declare dependencies on Objective packages
2. THE System SHALL allow Learning_Experience packages to declare dependencies on Assessment packages
3. THE System SHALL allow Assessment packages to declare dependencies on Objective packages
4. THE System SHALL prevent Objective packages from declaring dependencies on Learning_Experience or Assessment packages
5. THE System SHALL prevent Assessment packages from declaring dependencies on Learning_Experience packages
6. WHEN resolving dependencies, THE System SHALL validate that all dependency relationships follow the canonical model

### Requirement 5: Dependency Version Constraints

**User Story:** As a package author, I want to specify version constraints for my dependencies, so that I can control which versions are acceptable while allowing flexibility for updates.

#### Acceptance Criteria

1. THE forge.json manifest SHALL support semantic Version_Constraint ranges (e.g., ^1.2.0, ~2.1.0, >=1.0.0 <2.0.0)
2. THE dependency resolver SHALL respect declared version constraints when selecting package versions
3. THE dependency resolver SHALL prefer the highest compatible version within constraints
4. THE dependency resolver SHALL lock resolved versions during the build process
5. THE System SHALL generate a lockfile capturing exact resolved dependency versions
6. THE System SHALL validate that version constraints use valid semantic versioning syntax

### Requirement 6: Dependency Locking

**User Story:** As a package author, I want deterministic builds with locked dependency versions, so that my package builds reproducibly across environments.

#### Acceptance Criteria

1. THE Forge_CLI SHALL generate a lockfile (forge-lock.json) capturing all resolved dependency versions
2. THE Forge_CLI SHALL use the lockfile when present to ensure consistent dependency resolution
3. THE lockfile SHALL be a version-controlled artifact recommended for inclusion in repositories
4. THE Forge_CLI SHALL detect when the lockfile is out of sync with forge.json
5. THE Forge_CLI SHALL provide a command to update the lockfile when dependencies change
6. THE System SHALL fail CI validation if the lockfile is out of sync with declared dependencies
7. THE lockfile SHALL include the full transitive dependency graph with checksums

### CLI (forge) Authoring and Publishing

### Requirement 7: CLI Initialization and Manifest Creation

**User Story:** As a package author, I want to initialize a new package using the forge CLI, so that I can start authoring with proper structure and metadata.

#### Acceptance Criteria

1. WHEN a user runs "forge init", THE Forge_CLI SHALL create a new forge.json manifest file
2. THE Forge_CLI SHALL prompt the user for required metadata fields during initialization
3. THE Forge_CLI SHALL create a default directory structure for the package
4. THE Forge_CLI SHALL set the package type to one of: learning-experience, objective, or assessment
5. THE Forge_CLI SHALL initialize version to "0.1.0" by default
6. THE Forge_CLI SHALL include fields for name, description, type, ctdl, version, license, repository, dependencies, contributors, keywords, publish, and quality in the manifest

### Requirement 8: CLI Artifact Authoring

**User Story:** As a package author, I want to add artifacts to my package using the forge CLI, so that I can build my instructional content incrementally.

#### Acceptance Criteria

1. WHEN a user runs "forge add objective", THE Forge_CLI SHALL create a new Objective artifact file
2. WHEN a user runs "forge add assessment", THE Forge_CLI SHALL create a new Assessment artifact file
3. WHEN a user runs "forge add experience", THE Forge_CLI SHALL create a new Learning_Experience artifact file
4. THE Forge_CLI SHALL generate valid CTDL JSON-LD templates for each artifact type
5. THE Forge_CLI SHALL update the forge.json manifest to reference the new artifact
6. THE Forge_CLI SHALL assign a unique identifier to each new artifact

### Requirement 9: CLI Validation

**User Story:** As a package author, I want to validate my package locally before publishing, so that I can catch errors early in my workflow.

#### Acceptance Criteria

1. WHEN a user runs "forge validate", THE Forge_CLI SHALL check all artifacts against CTDL schemas
2. THE Forge_CLI SHALL validate that dependency relationships follow the canonical model
3. THE Forge_CLI SHALL check that all referenced dependencies exist in the manifest
4. THE Forge_CLI SHALL verify that the forge.json manifest contains all required fields
5. IF validation fails, THEN THE Forge_CLI SHALL output detailed error messages
6. IF validation succeeds, THEN THE Forge_CLI SHALL output a success confirmation

### Requirement 10: CLI Package Building

**User Story:** As a package author, I want to build my package into a publishable bundle, so that I can prepare it for distribution.

#### Acceptance Criteria

1. WHEN a user runs "forge build", THE Forge_CLI SHALL validate the package
2. THE Forge_CLI SHALL bundle all artifacts and metadata into a package archive
3. THE Forge_CLI SHALL generate a package manifest with checksums for integrity verification
4. THE Forge_CLI SHALL create a build output directory with the bundled package
5. IF the build fails validation, THEN THE Forge_CLI SHALL halt and report errors

### Requirement 11: CLI Package Publishing

**User Story:** As a package author, I want to publish my package to the registry, so that others can discover and use my instructional content.

#### Acceptance Criteria

1. WHEN a user runs "forge publish", THE Forge_CLI SHALL authenticate the user with the Registry
2. THE Forge_CLI SHALL build the package before publishing
3. THE Forge_CLI SHALL upload the package bundle to the Registry
4. THE Forge_CLI SHALL verify that the package name is unique or properly scoped
5. THE System SHALL mark published package versions as immutable
6. THE Forge_CLI SHALL output the published package URI and version

### Requirement 12: CLI Dependency Installation

**User Story:** As a package author, I want to install dependencies declared in my manifest, so that I can work with the complete dependency tree locally.

#### Acceptance Criteria

1. WHEN a user runs "forge install", THE Forge_CLI SHALL read dependencies from forge.json
2. THE Forge_CLI SHALL download all declared dependencies from the Registry
3. THE Forge_CLI SHALL resolve transitive dependencies recursively
4. THE Forge_CLI SHALL store downloaded packages in a local cache directory
5. THE Forge_CLI SHALL verify package checksums after download
6. IF a dependency cannot be resolved, THEN THE Forge_CLI SHALL report an error

### Requirement 13: CLI Dependency Addition

**User Story:** As a package author, I want to add dependencies to my package using the CLI, so that I can declare relationships to other packages.

#### Acceptance Criteria

1. WHEN a user runs "forge add <pkg>", THE Forge_CLI SHALL query the Registry for the specified package
2. THE Forge_CLI SHALL add the package to the dependencies section of forge.json
3. THE Forge_CLI SHALL download and install the dependency
4. THE Forge_CLI SHALL validate that the dependency relationship follows the canonical model
5. THE Forge_CLI SHALL use the latest stable version unless a specific version is specified

### Requirement 14: Objective-First Dependency Resolution

**User Story:** As a package author, I want to add an objective and automatically discover compatible assessments and learning experiences, so that I can build complete instructional packages efficiently.

#### Acceptance Criteria

1. WHEN a user runs "forge add-objective <uri|name>", THE Forge_CLI SHALL query the Registry for the specified Objective package
2. THE Forge_CLI SHALL search for Assessment packages that depend on the specified Objective
3. THE Forge_CLI SHALL search for Learning_Experience packages that depend on the specified Objective
4. THE Forge_CLI SHALL prefer stable releases unless a channel is specified
5. THE Forge_CLI SHALL output a resolved dependency set including the Objective and compatible packages
6. THE Forge_CLI SHALL update forge.json with the resolved dependencies
7. THE Forge_CLI SHALL prompt the user to select from multiple compatible options when available

### Requirement 15: CLI Dependency Resolution

**User Story:** As a package author, I want to resolve all dependencies and check for conflicts, so that I can ensure my package has a valid dependency tree.

#### Acceptance Criteria

1. WHEN a user runs "forge resolve", THE Forge_CLI SHALL analyze all declared dependencies
2. THE Forge_CLI SHALL detect version conflicts in the dependency tree
3. THE Forge_CLI SHALL detect circular dependencies
4. THE Forge_CLI SHALL validate that all dependency relationships follow the canonical model
5. IF conflicts are found, THEN THE Forge_CLI SHALL report them with suggested resolutions
6. IF resolution succeeds, THEN THE Forge_CLI SHALL output the complete dependency tree

### Versioning and Lineage

### Requirement 16: CLI Semantic Versioning

**User Story:** As a package author, I want to increment my package version using semantic versioning, so that I can communicate the nature of changes to users.

#### Acceptance Criteria

1. WHEN a user runs "forge version major", THE Forge_CLI SHALL increment the major version number
2. WHEN a user runs "forge version minor", THE Forge_CLI SHALL increment the minor version number
3. WHEN a user runs "forge version patch", THE Forge_CLI SHALL increment the patch version number
4. THE Forge_CLI SHALL update the version field in forge.json
5. THE Forge_CLI SHALL create a git tag for the new version if in a git repository
6. THE Forge_CLI SHALL reset lower-order version numbers when incrementing higher-order numbers

### Requirement 17: CLI Version Diffing

**User Story:** As a package author, I want to compare two versions of a package, so that I can understand what changed between releases.

#### Acceptance Criteria

1. WHEN a user runs "forge diff <version1> <version2>", THE Forge_CLI SHALL retrieve both package versions
2. THE Forge_CLI SHALL compare the CTDL artifacts between versions
3. THE Forge_CLI SHALL compare the dependency declarations between versions
4. THE Forge_CLI SHALL output a human-readable diff showing additions, deletions, and modifications
5. THE Forge_CLI SHALL highlight changes to critical fields like objectives and competencies

### Registry Browsing and Search

### Requirement 18: Registry Package Browsing

**User Story:** As an instructional designer, I want to browse available packages in the registry, so that I can discover reusable learning components.

#### Acceptance Criteria

1. THE System SHALL display a paginated list of published packages
2. THE System SHALL show package name, description, type, and latest version for each package
3. THE System SHALL allow filtering packages by type (Learning_Experience, Objective, Assessment)
4. THE System SHALL allow sorting packages by name, publish date, or popularity
5. WHEN a user clicks on a package, THE System SHALL navigate to the package detail page

### Requirement 19: Registry Package Search

**User Story:** As an instructional designer, I want to search for packages by keywords, so that I can quickly find relevant learning components.

#### Acceptance Criteria

1. THE System SHALL provide a search interface on the registry page
2. WHEN a user enters a search query, THE System SHALL search package names, descriptions, and keywords
3. THE System SHALL return results ranked by relevance
4. THE System SHALL highlight matching terms in search results
5. THE System SHALL support filtering search results by package type

### Requirement 20: Semantic Package Search

**User Story:** As an instructional designer, I want to find packages similar to my search query using semantic search, so that I can discover relevant content even when exact keywords don't match.

#### Acceptance Criteria

1. THE System SHALL generate embeddings for package titles, descriptions, and competency statements
2. WHEN a user performs a search, THE System SHALL generate an embedding for the query
3. THE System SHALL use pgvector to find packages with similar embeddings
4. THE System SHALL return semantically similar packages ranked by similarity score
5. THE System SHALL combine keyword search and semantic search results
6. THE System SHALL provide explanation metadata for semantic matches showing matched competencies, fields, or embedding similarity scores

### Requirement 21: Package Recommendations

**User Story:** As an instructional designer, I want to see recommended packages related to the one I'm viewing, so that I can discover complementary learning components.

#### Acceptance Criteria

1. WHEN viewing a package detail page, THE System SHALL display recommended similar packages
2. THE System SHALL use Semantic_Search to find packages with similar content
3. THE System SHALL recommend packages that share dependencies
4. THE System SHALL recommend packages from the same author or organization
5. THE System SHALL limit recommendations to packages of compatible types

### Requirement 22: Suggested Dependencies

**User Story:** As a package author, I want to see suggested dependencies for my package, so that I can discover relevant objectives and assessments to include.

#### Acceptance Criteria

1. WHEN authoring a Learning_Experience, THE System SHALL suggest relevant Objective packages
2. WHEN authoring a Learning_Experience, THE System SHALL suggest relevant Assessment packages
3. WHEN authoring an Assessment, THE System SHALL suggest relevant Objective packages
4. THE System SHALL use Semantic_Search to find dependencies with similar content
5. THE System SHALL rank suggestions by semantic similarity score

### Requirement 23: Package Version Details

**User Story:** As an instructional designer, I want to view detailed information about a specific package version, so that I can understand its contents and dependencies before using it.

#### Acceptance Criteria

1. THE System SHALL display the package name, version, description, and type
2. THE System SHALL render the CTDL artifacts in a human-readable format
3. THE System SHALL display all declared dependencies with their versions
4. THE System SHALL show the package's dependency tree
5. THE System SHALL display metadata including author, license, repository, and keywords
6. THE System SHALL show quality check results and security scan status

### Requirement 24: CTDL Artifact Rendering

**User Story:** As an instructional designer, I want to view CTDL artifacts in a readable format, so that I can understand the learning content without parsing raw JSON-LD.

#### Acceptance Criteria

1. THE System SHALL render Objective artifacts showing competency statements and alignment information
2. THE System SHALL render Assessment artifacts showing evaluation criteria and linked objectives
3. THE System SHALL render Learning_Experience artifacts showing instructional activities and linked objectives
4. THE System SHALL display CTDL properties in a structured, labeled format
5. THE System SHALL provide a toggle to view the raw JSON-LD representation

### Web-Based Authoring

### Requirement 25: Web-Based Objective Authoring

**User Story:** As an instructional designer, I want to create Objective packages through the web interface, so that I can author content without using the CLI.

#### Acceptance Criteria

1. THE System SHALL provide a form for creating new Objective packages
2. THE System SHALL include fields for all required CTDL-ASN properties
3. THE System SHALL validate input against CTDL-ASN schema in real-time
4. THE System SHALL generate valid CTDL-ASN JSON-LD from the form data
5. THE System SHALL save draft versions before publishing
6. THE System SHALL allow editing of unpublished Objective packages

### Requirement 26: Web-Based Assessment Authoring

**User Story:** As an instructional designer, I want to create Assessment packages through the web interface, so that I can author evaluation instruments without using the CLI.

#### Acceptance Criteria

1. THE System SHALL provide a form for creating new Assessment packages
2. THE System SHALL include fields for all required CTDL properties
3. THE System SHALL allow linking to Objective packages as dependencies
4. THE System SHALL validate that linked Objectives exist in the Registry
5. THE System SHALL generate valid CTDL JSON-LD from the form data
6. THE System SHALL save draft versions before publishing

### Requirement 27: Web-Based Learning Experience Authoring

**User Story:** As an instructional designer, I want to create Learning Experience packages through the web interface, so that I can author instructional activities without using the CLI.

#### Acceptance Criteria

1. THE System SHALL provide a form for creating new Learning_Experience packages
2. THE System SHALL include fields for all required CTDL properties
3. THE System SHALL allow linking to Objective and Assessment packages as dependencies
4. THE System SHALL validate that linked dependencies exist in the Registry
5. THE System SHALL generate valid CTDL JSON-LD from the form data
6. THE System SHALL save draft versions before publishing

### Organization and Team Management

### Requirement 28: Organization Management

**User Story:** As a team lead, I want to create and manage organizations, so that I can group related packages and manage team access.

#### Acceptance Criteria

1. THE System SHALL allow authenticated users to create new Organizations
2. THE System SHALL assign the creator as the organization owner
3. THE System SHALL allow organization owners to update organization metadata
4. THE System SHALL support organization-scoped package names
5. THE System SHALL display all packages owned by an organization on its profile page

### Requirement 29: Team Management

**User Story:** As an organization owner, I want to create teams within my organization, so that I can organize collaborators and manage permissions.

#### Acceptance Criteria

1. THE System SHALL allow organization owners to create Teams
2. THE System SHALL allow organization owners to add users to Teams
3. THE System SHALL allow organization owners to remove users from Teams
4. THE System SHALL allow assigning Teams to specific packages
5. THE System SHALL display team membership on the organization page

### Requirement 30: Role-Based Access Control

**User Story:** As an organization owner, I want to assign roles to team members, so that I can control who can modify and publish packages.

#### Acceptance Criteria

1. THE System SHALL support four roles: owner, maintainer, contributor, and reviewer
2. THE System SHALL allow owners to perform all operations on packages
3. THE System SHALL allow maintainers to publish packages and manage contributors
4. THE System SHALL allow contributors to create and edit drafts but not publish
5. THE System SHALL allow reviewers to review and approve Pull_Requests but not publish
6. THE System SHALL enforce role permissions on all package operations

### Requirement 31: Package Ownership and Stewardship

**User Story:** As a platform administrator, I want clear package ownership rules, so that governance and accountability are maintained throughout the package lifecycle.

#### Acceptance Criteria

1. THE System SHALL assign exactly one owning Organization or User to each package
2. THE System SHALL allow ownership transfer by Organization owners
3. WHEN an Organization is deleted, THE System SHALL mark its packages as Orphaned_Packages
4. THE System SHALL make Orphaned_Packages read-only until ownership is reassigned
5. THE System SHALL require valid ownership for publishing, deprecation, and archival operations
6. THE System SHALL display the current owner on the package detail page
7. THE System SHALL maintain an audit log of ownership transfers

### Collaboration and Review Workflows

### Requirement 32: Pull Request Creation

**User Story:** As a contributor, I want to propose changes to a package through a pull request, so that my contributions can be reviewed before merging.

#### Acceptance Criteria

1. THE System SHALL allow contributors to create Pull_Requests for packages
2. THE System SHALL capture the proposed changes as a diff
3. THE System SHALL allow the contributor to add a description and title
4. THE System SHALL assign the Pull_Request to package maintainers for review
5. THE System SHALL prevent direct modification of published packages by contributors

### Requirement 33: Pull Request Review

**User Story:** As a package maintainer, I want to review pull requests, so that I can ensure quality before accepting contributions.

#### Acceptance Criteria

1. THE System SHALL display all open Pull_Requests for packages I maintain
2. THE System SHALL show the proposed changes in a diff view
3. THE System SHALL allow me to add comments on specific changes
4. THE System SHALL allow me to approve or reject the Pull_Request
5. WHEN I approve a Pull_Request, THE System SHALL merge the changes into the package
6. WHEN I reject a Pull_Request, THE System SHALL notify the contributor with my comments

### Requirement 34: Review Assignment

**User Story:** As an organization owner, I want to configure review requirements for pull requests, so that quality standards are enforced consistently.

#### Acceptance Criteria

1. THE System SHALL require at least one reviewer approval for each Pull_Request
2. THE System SHALL allow organizations to configure default reviewers for their packages
3. THE System SHALL allow organizations to configure approval thresholds (number of required approvals)
4. THE System SHALL disallow self-approval unless the user is the package owner
5. THE System SHALL notify assigned reviewers when a Pull_Request is created
6. THE System SHALL display review status and assigned reviewers on the Pull_Request page

### Package Lifecycle States

CourseForge packages progress through a defined set of lifecycle states that govern visibility, mutability, and publishing eligibility.

**Important:** Lifecycle_State applies to a specific package version, not the package name as a whole. Different versions of the same package may be in different lifecycle states simultaneously.

- **draft**: Initial authoring state. Package version is editable and visible only to contributors. Not publishable.
- **under-review**: Package version has been submitted for review via pull request or quality gate evaluation. Editable only through review feedback. Not publishable.
- **approved**: Package version has passed all required quality gates and reviews. Ready for publication but not yet published. Immutable except for metadata.
- **published**: Package version is live in the registry. Fully immutable. Discoverable and installable by all users (subject to Package_Visibility settings).
- **deprecated**: Published package version marked as outdated. Remains installable with warnings. Discoverable with deprecation notice.
- **archived**: Package version removed from active discovery but preserved for historical access. Installable only by explicit version reference.

### Requirement 35: Package Lifecycle Management

**User Story:** As a package author, I want packages to progress through defined lifecycle states, so that publication is controlled and quality is maintained.

#### Acceptance Criteria

1. THE System SHALL enforce allowed state transitions: draft → under-review → approved → published → deprecated → archived
2. THE System SHALL allow transitions from under-review back to draft when review feedback requires changes
3. THE System SHALL prevent publication of package versions not in the approved state
4. THE System SHALL make published package versions immutable
5. THE System SHALL allow deprecated package versions to remain installable while displaying warnings
6. THE System SHALL make archived package versions non-discoverable but historically accessible via explicit version reference
7. THE System SHALL integrate lifecycle states with Pull_Request workflows
8. THE System SHALL integrate lifecycle states with Quality_Gate execution
9. THE System SHALL display the current lifecycle state on package version pages
10. THE System SHALL allow different versions of the same package to be in different lifecycle states simultaneously

### Requirement 36: Artifact Versioning

**User Story:** As a package author, I want artifacts within packages to have versioned identifiers, so that I can track changes to individual learning components over time.

#### Acceptance Criteria

1. THE System SHALL include the package version in each artifact identifier
2. THE System SHALL make artifacts immutable once their containing package version is published
3. THE Forge_CLI SHALL expose artifact-level diffs via the "forge diff" command
4. THE System SHALL display artifact version history on the package detail page
5. THE System SHALL allow querying artifacts by their versioned identifiers

### Requirement 37: Package Branching

**User Story:** As a package author, I want to create branches for my package, so that I can work on experimental changes without affecting the main version.

#### Acceptance Criteria

1. THE System SHALL allow package owners to create named branches
2. THE System SHALL initialize new branches from a specified version
3. THE System SHALL allow independent versioning on each branch
4. THE System SHALL track the branch lineage for each version
5. THE System SHALL allow publishing versions from any branch

### Requirement 38: Package Merging

**User Story:** As a package author, I want to merge changes from one branch to another, so that I can incorporate experimental work into the main version line.

#### Acceptance Criteria

1. THE System SHALL allow package owners to merge branches
2. THE System SHALL detect conflicts between branch versions
3. IF conflicts exist, THEN THE System SHALL require manual resolution before merging
4. THE System SHALL create a new version on the target branch with merged changes
5. THE System SHALL preserve the merge history in package metadata

### Quality Gates and Security

### Requirement 39: Schema Validation Quality Gate

**User Story:** As a package publisher, I want schema validation to run automatically before publishing, so that I can ensure CTDL compliance.

#### Acceptance Criteria

1. WHEN a user attempts to publish a package, THE System SHALL run schema validation as a Quality_Gate
2. THE System SHALL validate all artifacts against their respective CTDL schemas
3. IF validation fails, THEN THE System SHALL prevent publication and report errors
4. IF validation succeeds, THEN THE System SHALL mark the check as passed
5. THE System SHALL display validation status on the package page

### Requirement 40: Accessibility Quality Gate

**User Story:** As a package publisher, I want accessibility checks to run on my learning content, so that I can ensure my materials are inclusive.

#### Acceptance Criteria

1. WHERE accessibility checking is enabled, THE System SHALL run accessibility validation as a Quality_Gate
2. THE System SHALL check for required accessibility metadata in CTDL artifacts
3. THE System SHALL validate that learning resources include alternative text and captions where applicable
4. IF accessibility checks fail, THEN THE System SHALL report specific issues
5. THE System SHALL allow configuration of whether accessibility checks are required or advisory

### Requirement 41: Rubric Alignment Quality Gate

**User Story:** As a package publisher, I want to verify that my assessments align with stated objectives, so that I can ensure instructional coherence.

#### Acceptance Criteria

1. WHERE rubric alignment checking is enabled, THE System SHALL validate Assessment-Objective alignment
2. THE System SHALL check that all Assessment criteria map to declared Objective dependencies
3. THE System SHALL check that all declared Objectives are assessed
4. IF alignment issues are found, THEN THE System SHALL report which objectives lack assessment
5. THE System SHALL allow configuration of whether alignment checks are required or advisory

### Requirement 42: Security Scanning

**User Story:** As a package publisher, I want my package scanned for security issues, so that I can ensure I'm not distributing vulnerable content.

#### Acceptance Criteria

1. WHEN a package is published, THE System SHALL scan for embedded scripts or executable content
2. THE System SHALL check for known malicious patterns in CTDL content
3. THE System SHALL validate that external resource URLs use secure protocols
4. IF security issues are found, THEN THE System SHALL flag the package and notify the author
5. THE System SHALL display security scan status on the package page

### Requirement 43: Required Quality Gates Configuration

**User Story:** As an organization owner, I want to configure which quality gates are required for publishing, so that I can enforce quality standards for my organization's packages.

#### Acceptance Criteria

1. THE System SHALL allow organization owners to configure required Quality_Gates
2. THE System SHALL support marking individual gates as required, advisory, or disabled
3. THE System SHALL prevent publication if any required Quality_Gate fails
4. THE System SHALL allow publication with warnings if advisory Quality_Gates fail
5. THE System SHALL display the quality gate configuration on the organization page

### Package Management Fundamentals

### Requirement 44: Package Name Uniqueness

**User Story:** As a package publisher, I want package names to be unique within their scope, so that there is no ambiguity when referencing packages.

#### Acceptance Criteria

1. THE System SHALL enforce global uniqueness for unscoped package names
2. THE System SHALL enforce uniqueness within an organization for scoped package names
3. WHEN a user attempts to publish a package with a duplicate name, THE System SHALL reject the publication
4. THE System SHALL allow the same unscoped name if it is scoped to different organizations
5. THE System SHALL validate package name format and allowed characters

### Requirement 45: Immutable Published Versions

**User Story:** As a package consumer, I want published package versions to be immutable, so that I can rely on consistent behavior when using a specific version.

#### Acceptance Criteria

1. THE System SHALL prevent modification of published package versions
2. THE System SHALL prevent deletion of published package versions
3. IF a package needs changes, THEN THE System SHALL require publishing a new version
4. THE System SHALL preserve all metadata and artifacts for published versions indefinitely
5. THE System SHALL return an error if a user attempts to modify a published version

### Requirement 46: Version Lineage Tracking

**User Story:** As a package author, I want to track which branch each version was published from, so that I can understand the version history and lineage.

#### Acceptance Criteria

1. THE System SHALL record the source branch for each published version
2. THE System SHALL display the branch lineage on the package version page
3. THE System SHALL allow filtering versions by branch
4. THE System SHALL show the parent version for each version in the lineage
5. THE System SHALL visualize the version tree including branches and merges

### Authentication and Access

### Requirement 47: User Authentication

**User Story:** As a user, I want to authenticate with the platform, so that I can publish packages and collaborate with others.

#### Acceptance Criteria

1. THE System SHALL provide email and password authentication
2. THE System SHALL support OAuth authentication with common providers
3. THE System SHALL create a user profile upon first authentication
4. THE System SHALL issue secure session tokens for authenticated users
5. THE System SHALL require authentication for publishing, authoring, and collaboration features

### Requirement 48: API Authentication for CLI

**User Story:** As a CLI user, I want to authenticate with the registry from the command line, so that I can publish packages without using the web interface.

#### Acceptance Criteria

1. THE System SHALL provide an API authentication endpoint for the Forge_CLI
2. THE System SHALL issue API tokens for authenticated CLI sessions
3. THE Forge_CLI SHALL store API tokens securely in the user's home directory
4. THE Forge_CLI SHALL include the API token in all authenticated requests
5. THE System SHALL validate API tokens and reject requests with invalid tokens

### Requirement 49: Registry Environments

**User Story:** As a package author, I want to publish packages to different registry environments, so that I can test in staging before promoting to production.

#### Acceptance Criteria

1. THE System SHALL support multiple Registry_Environment instances (local, staging, production)
2. THE Forge_CLI SHALL allow targeting specific registry endpoints via configuration
3. THE System SHALL support organization-scoped registries and private namespaces
4. THE System SHALL provide a mechanism to promote packages between environments
5. THE System SHALL allow environment-specific Quality_Gate configuration
6. THE Forge_CLI SHALL store environment configurations in user settings
7. THE System SHALL maintain independent package catalogs per environment
8. WHEN promoting a package, THE System SHALL preserve version identifiers
9. WHEN promoting a package, THE System SHALL preserve checksums
10. WHEN promoting a package, THE System SHALL require passing destination environment Quality_Gates
11. THE System SHALL make package promotions auditable with timestamp and actor information
12. THE System SHALL apply promotion only to published package versions
13. THE System SHALL copy packages during promotion (source environment remains unchanged)

### Package Statistics and Lifecycle

### Requirement 50: Package Download Statistics

**User Story:** As a package author, I want to see how many times my package has been downloaded, so that I can understand its usage and popularity.

#### Acceptance Criteria

1. THE System SHALL track download counts for each package version
2. THE System SHALL display total downloads on the package page
3. THE System SHALL display downloads per version
4. THE System SHALL update download counts when packages are installed via the Forge_CLI
5. THE System SHALL update download counts when packages are downloaded via the web interface

### Requirement 51: Registry Consumer API

**User Story:** As a third-party developer, I want to retrieve packages programmatically via an API, so that I can integrate CourseForge content into external systems.

#### Acceptance Criteria

1. THE System SHALL provide a read-only public Consumer_API for retrieving published packages
2. THE Consumer_API SHALL support version-specific artifact retrieval
3. THE Consumer_API SHALL provide dependency tree resolution endpoints
4. THE Consumer_API SHALL require authentication for accessing private packages
5. THE Consumer_API SHALL implement rate limiting to prevent abuse
6. THE Consumer_API SHALL enforce access control based on package visibility settings
7. THE Consumer_API SHALL return packages in CTDL JSON-LD format

### Requirement 52: Package Visibility

**User Story:** As a package owner, I want to control who can access my packages, so that I can keep proprietary content private while sharing public content openly.

#### Acceptance Criteria

1. THE System SHALL support three Package_Visibility settings: public, organization-private, and team-private
2. THE System SHALL make public packages discoverable and accessible to all users
3. THE System SHALL restrict organization-private packages to members of the owning organization
4. THE System SHALL restrict team-private packages to members of assigned teams
5. THE Consumer_API SHALL require authentication for accessing private packages
6. THE System SHALL enforce visibility settings on all package operations (search, download, view)

### Requirement 53: Platform Metrics

**User Story:** As a platform administrator, I want to track platform usage metrics, so that I can understand adoption patterns and identify issues.

#### Acceptance Criteria

1. THE System SHALL track successful and failed publish attempts
2. THE System SHALL track validation failures by type (schema, accessibility, rubric, security)
3. THE System SHALL track dependency graph depth distribution across packages
4. THE System SHALL track package reuse metrics (number of dependents per package)
5. THE System SHALL provide an organization-level reporting dashboard
6. THE System SHALL allow administrative export of metrics data
7. THE System SHALL track semantic search query patterns and result quality

### Requirement 54: Package Deprecation

**User Story:** As a package author, I want to mark packages as deprecated, so that I can guide users away from outdated versions.

#### Acceptance Criteria

1. THE System SHALL allow package owners to mark versions as deprecated
2. THE System SHALL allow specifying a deprecation message and recommended alternative
3. WHEN a deprecated package is viewed, THE System SHALL display a deprecation warning
4. WHEN a deprecated package is installed via Forge_CLI, THE Forge_CLI SHALL display a deprecation warning
5. THE System SHALL still allow installation of deprecated packages

### Requirement 55: Package Unpublishing

**User Story:** As a package author, I want to unpublish a package version within 24 hours of publishing, so that I can correct critical errors quickly.

#### Acceptance Criteria

1. THE System SHALL allow package owners to unpublish versions within 24 hours of publication
2. THE System SHALL prevent unpublishing after the 24-hour window
3. WHEN a version is unpublished, THE System SHALL remove it from search results and listings
4. THE System SHALL prevent installation of unpublished versions
5. THE System SHALL notify users who have already installed the unpublished version

### Semantic Search Infrastructure

### Requirement 56: Embedding Generation for Semantic Search

**User Story:** As a system administrator, I want embeddings generated automatically for all packages, so that semantic search capabilities are available without manual intervention.

#### Acceptance Criteria

1. WHEN a package is published, THE System SHALL generate embeddings for the package title
2. THE System SHALL generate embeddings for the package description
3. THE System SHALL generate embeddings for all competency statements in Objective artifacts
4. THE System SHALL generate embeddings for learning outcomes in Learning_Experience artifacts
5. THE System SHALL store embeddings in the pgvector-enabled database
6. THE System SHALL update embeddings for draft and under-review package versions when content is modified
7. THE System SHALL generate immutable embeddings upon publication of a package version
8. THE System SHALL track the embedding model version used for each embedding
9. THE System SHALL support reindexing all packages when the embedding model changes
10. THE System SHALL allow organization-level opt-out of semantic indexing for private packages
11. THE System SHALL support background re-embedding jobs for model updates
12. THE System SHALL log embedding generation events for audit and debugging

### Requirement 57: Transitive Dependency Resolution

**User Story:** As a package consumer, I want all transitive dependencies resolved automatically, so that I have a complete working set of packages.

#### Acceptance Criteria

1. WHEN installing a package, THE System SHALL resolve all direct dependencies
2. THE System SHALL recursively resolve dependencies of dependencies
3. THE System SHALL detect and prevent circular dependency chains
4. THE System SHALL select compatible versions when multiple versions are required
5. IF version conflicts cannot be resolved, THEN THE System SHALL report the conflict and halt installation

### Requirement 58: Package Checksums and Integrity

**User Story:** As a package consumer, I want package integrity verified during installation, so that I can trust the content has not been tampered with.

#### Acceptance Criteria

1. WHEN a package is published, THE System SHALL generate a checksum for the package bundle
2. THE System SHALL store the checksum in the package metadata
3. WHEN a package is downloaded, THE Forge_CLI SHALL verify the checksum
4. IF the checksum does not match, THEN THE Forge_CLI SHALL reject the package and report an error
5. THE System SHALL use a cryptographically secure hash algorithm for checksums

### Package Metadata

### Requirement 59: Package License Declaration

**User Story:** As a package author, I want to declare the license for my package, so that users understand the terms under which they can use my content.

#### Acceptance Criteria

1. THE System SHALL require a license field in the package manifest
2. THE System SHALL support standard license identifiers (SPDX format)
3. THE System SHALL display the license on the package detail page
4. THE System SHALL allow custom license text for non-standard licenses
5. THE Forge_CLI SHALL validate that a license is specified before publishing

### Requirement 60: Package Keywords and Tagging

**User Story:** As a package author, I want to add keywords to my package, so that users can discover it through relevant searches.

#### Acceptance Criteria

1. THE System SHALL allow package authors to specify keywords in the manifest
2. THE System SHALL index keywords for search functionality
3. THE System SHALL display keywords on the package detail page
4. THE System SHALL allow filtering search results by keyword
5. THE System SHALL suggest popular keywords during package authoring
