# Design Document: CourseForge

## Overview

CourseForge is a collaborative registry platform for CTDL-native learning components, architected as a three-tier system:

1. **Next.js Web Application**: Provides registry browsing, semantic search, and web-based authoring with server-side rendering for optimal performance
2. **Forge CLI**: A command-line tool offering full feature parity for core workflows including authoring, publishing, dependency management, and collaboration
3. **PostgreSQL Database with pgvector**: Stores CTDL artifacts as JSON-LD, manages package metadata, and enables semantic search through vector embeddings

The platform enforces a canonical dependency model where Learning Experiences depend on Objectives and Assessments, and Assessments depend on Objectives. This objective-first design ensures instructional coherence and enables powerful discovery workflows.

CourseForge supports three artifact types stored as standards-compliant CTDL/CTDL-ASN JSON-LD:
- **Objectives**: CTDL-ASN competency statements forming the foundation of instructional design
- **Assessments**: CTDL evaluation instruments measuring objective achievement
- **Learning Experiences**: CTDL instructional activities helping learners achieve objectives

Packages progress through a defined lifecycle (draft → under-review → approved → published → deprecated → archived) with quality gates enforcing CTDL schema validation, accessibility compliance, rubric alignment, and security scanning. The platform supports multiple registry environments (local, staging, production) with independent package catalogs and configurable quality gates.

## Architecture

### System Architecture

CourseForge follows a layered architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                     Presentation Layer                       │
│  ┌──────────────────────┐      ┌──────────────────────┐    │
│  │   Next.js Web App    │      │     Forge CLI        │    │
│  │  (React + SSR)       │      │  (Node.js/TypeScript)│    │
│  └──────────────────────┘      └──────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              API Routes (Next.js)                     │  │
│  │  - Package Management  - Search & Discovery          │  │
│  │  - Authentication      - Quality Gates               │  │
│  │  - Collaboration       - Consumer API (Isolated)     │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Business Logic Layer                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Package    │  │  Dependency  │  │   Quality    │     │
│  │   Service    │  │   Resolver   │  │   Gates      │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   CTDL       │  │   Semantic   │  │   Lifecycle  │     │
│  │  Validator   │  │   Search     │  │   Manager    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   CTDL       │  │   Web        │  │   Download   │     │
│  │  Renderer    │  │  Authoring   │  │   Stats      │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Platform    │  │   License    │  │   Keyword    │     │
│  │  Metrics     │  │  Validator   │  │  Suggestion  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│  ┌──────────────┐  ┌──────────────┐                       │
│  │   README     │  │   Channel    │                       │
│  │  Validator   │  │   Manager    │                       │
│  └──────────────┘  └──────────────┘                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  Background Processing Layer                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Embedding   │  │ Notification │  │   Metrics    │     │
│  │  Generation  │  │   Delivery   │  │ Aggregation  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│  ┌──────────────┐  ┌──────────────┐                       │
│  │   Quality    │  │   Download   │                       │
│  │   Gate Exec  │  │   Recording  │                       │
│  └──────────────┘  └──────────────┘                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                       Data Layer                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         PostgreSQL with pgvector Extension            │  │
│  │  - Package Metadata    - CTDL Artifacts (JSONB)      │  │
│  │  - User/Org/Team Data  - Vector Embeddings           │  │
│  │  - Audit Logs          - Dependency Graph            │  │
│  │  - Download Records    - Metric Events               │  │
│  │  - Notifications       - Review Configurations       │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Object Storage (S3-compatible)                │  │
│  │  - Package Bundles     - README Assets               │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Redis Cache                                   │  │
│  │  - Package Metadata    - Search Results              │  │
│  │  - Dependency Trees    - User Sessions               │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```


### Technology Stack

**Frontend (Next.js Web Application)**:
- Next.js 14+ with App Router for server-side rendering and API routes
- React 18+ for UI components
- TypeScript for type safety
- Tailwind CSS for styling
- React Query for data fetching and caching
- Markdown renderer for README and documentation display

**Backend (API & Business Logic)**:
- Next.js API routes for REST endpoints
- Node.js runtime
- TypeScript for type safety
- JSON Schema for CTDL validation
- OpenAI or similar embedding API for semantic search
- BullMQ for background job processing

**CLI (Forge)**:
- Node.js/TypeScript
- Commander.js for CLI framework
- Axios for HTTP client
- Chalk for terminal styling
- Inquirer for interactive prompts

**Database**:
- PostgreSQL 15+ with pgvector extension
- Prisma ORM for type-safe database access
- JSONB columns for CTDL artifact storage
- Vector columns for semantic search embeddings

**Caching**:
- Redis for caching package metadata, search results, and dependency trees
- Cache invalidation on package publish/update
- TTL-based expiration for search results (5 minutes)
- Session storage for authenticated users

**Background Processing**:
- BullMQ (Redis-backed job queue)
- Job types: embedding generation, notification delivery, metrics aggregation, quality gate execution, download recording
- Retry logic with exponential backoff
- Job monitoring and failure alerting

**Object Storage**:
- S3-compatible storage for package bundles
- Versioned objects for immutability
- Presigned URLs for secure downloads
- Lifecycle policies for archival

**Authentication**:
- NextAuth.js for web authentication
- JWT tokens for API authentication
- OAuth providers (GitHub, Google, etc.)

**Infrastructure**:
- Vercel or similar for Next.js deployment
- Managed PostgreSQL (AWS RDS, Supabase, etc.)
- Managed Redis (AWS ElastiCache, Upstash, etc.)
- Object storage (AWS S3, Cloudflare R2, etc.)


### Key Architectural Decisions

**1. CTDL as Native Data Model**

CTDL and CTDL-ASN are not export formats—they are the native storage format. All artifacts are stored as JSON-LD in JSONB columns, enabling:
- Direct standards compliance without transformation
- Rich querying of CTDL properties using PostgreSQL JSON operators
- Future-proof interoperability with CTDL-aware systems

**2. CLI-First Parity**

The Forge CLI is a first-class citizen with comprehensive feature parity for core workflows. This requires:
- Shared business logic between web and CLI (implemented as reusable services)
- Consistent API contracts that both clients consume
- CLI-friendly output formats (JSON, table, plain text)

**3. Semantic Search with pgvector**

Semantic search is implemented using pgvector for vector similarity search:
- Embeddings generated at publish time and stored alongside packages
- Cosine similarity search for finding related packages
- Fallback to keyword search if semantic infrastructure unavailable
- Background reindexing support for embedding model updates

**4. Immutability and Versioning**

Published package versions are immutable to ensure reproducibility:
- Artifacts and metadata frozen at publication
- Changes require new version publication
- Checksums verify package integrity
- 24-hour unpublish window for critical error correction

**5. Multi-Environment Support**

Independent registry environments (local, staging, production) enable safe testing:
- Separate package catalogs per environment
- Environment-specific quality gate configuration
- Package promotion workflow between environments
- CLI configuration for targeting specific environments

**6. Background Job Processing**

Long-running and asynchronous operations are handled by background jobs:
- Embedding generation (can take minutes for large packages)
- Notification delivery (email, webhook)
- Metrics aggregation (daily/weekly rollups)
- Quality gate execution (security scanning, accessibility checks)
- Download recording (batch inserts for performance)

**7. Caching Strategy**

Redis caching reduces database load and improves response times:
- Package metadata cached with 1-hour TTL
- Search results cached with 5-minute TTL
- Dependency trees cached with 1-hour TTL
- Cache invalidation on package publish/update
- User sessions stored in Redis

**8. API Structure and Consumer API Isolation**

The API is structured into two distinct surfaces:
- **Internal API** (`/api/*`): Full CRUD operations, requires authentication, used by web app and CLI
- **Consumer API** (`/api/consumer/*`): Read-only, public access for published packages, isolated for stability and rate limiting

This separation ensures:
- Consumer API stability independent of internal API changes
- Separate rate limiting policies
- Clear contract for third-party integrations
- Ability to version Consumer API independently

**9. Package Bundle Storage**

Package bundles are stored in S3-compatible object storage:
- Path structure: `{environment}/{packageName}/{version}/bundle.tar.gz`
- Versioned objects for immutability
- Presigned URLs for secure downloads (1-hour expiration)
- Lifecycle policies: transition to Glacier after 1 year for archived packages
- Checksums stored in database for integrity verification

**10. CLI-Server Logic Separation**

The CLI is a thin client that delegates all business logic to the server:
- CLI handles: user input, output formatting, local file operations, authentication token storage
- Server handles: validation, dependency resolution, quality gates, state management
- This ensures consistency between web and CLI workflows
- Enables server-side improvements without CLI updates



## Components and Interfaces

### Core Components

#### 1. Package Service

Manages package lifecycle, versioning, and metadata operations.

**Responsibilities**:
- Create, read, update package metadata
- Enforce lifecycle state transitions
- Manage package ownership and permissions
- Handle package branching and merging
- Generate package checksums
- Coordinate package promotion between environments

**Key Methods**:
```typescript
interface PackageService {
  createPackage(manifest: PackageManifest, owner: Owner): Promise<Package>
  publishPackage(packageId: string, version: string): Promise<PublishedPackage>
  transitionLifecycleState(packageId: string, version: string, targetState: LifecycleState): Promise<Package>
  createBranch(packageId: string, branchName: string, fromVersion: string): Promise<Branch>
  mergeBranch(packageId: string, sourceBranch: string, targetBranch: string): Promise<MergeResult>
  transferOwnership(packageId: string, newOwner: Owner): Promise<Package>
  deprecatePackage(packageId: string, version: string, message: string, alternative?: string): Promise<Package>
  unpublishPackage(packageId: string, version: string): Promise<void>
  promotePackage(packageId: string, version: string, targetEnv: Environment): Promise<Package>
  getPackageMetadata(packageId: string, version?: string): Promise<PackageMetadata>
}
```

#### 2. CTDL Validator

Validates CTDL and CTDL-ASN artifacts against schemas.

**Responsibilities**:
- Load and cache CTDL/CTDL-ASN JSON schemas
- Validate artifacts against appropriate schemas
- Check JSON-LD structure and required fields
- Return detailed validation errors with field paths
- Support three validation contexts: local CLI, pre-publish, quality gate

**Key Methods**:
```typescript
interface CTDLValidator {
  validateObjective(artifact: CTDLArtifact): ValidationResult
  validateAssessment(artifact: CTDLArtifact): ValidationResult
  validateLearningExperience(artifact: CTDLArtifact): ValidationResult
  validateManifest(manifest: PackageManifest): ValidationResult
  validateJSONLD(artifact: any): ValidationResult
}

interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

interface ValidationError {
  field: string
  message: string
  severity: 'error' | 'warning'
}
```


#### 3. CTDL Renderer Service

Renders CTDL/CTDL-ASN artifacts into human-readable HTML for web display.

**Responsibilities**:
- Parse CTDL JSON-LD artifacts
- Generate structured HTML representations
- Handle all CTDL artifact types (Objectives, Assessments, Learning Experiences)
- Provide toggle between rendered and raw JSON-LD views
- Support accessibility-compliant HTML output

**Key Methods**:
```typescript
interface CTDLRendererService {
  renderObjective(artifact: ObjectiveArtifact): RenderedArtifact
  renderAssessment(artifact: AssessmentArtifact): RenderedArtifact
  renderLearningExperience(artifact: LearningExperienceArtifact): RenderedArtifact
  renderArtifactList(artifacts: CTDLArtifact[]): RenderedArtifactList
}

interface RenderedArtifact {
  html: string
  metadata: ArtifactMetadata
  linkedArtifacts: string[]  // URIs of linked artifacts
}
```

**Validates: Requirements 24.1, 24.2, 24.3, 24.4, 24.5**

#### 4. Web Authoring Service

Provides web-based authoring capabilities for CTDL artifacts.

**Responsibilities**:
- Generate CTDL JSON-LD from web form inputs
- Validate form data in real-time
- Save draft versions
- Link artifacts to dependencies
- Support all three artifact types

**Key Methods**:
```typescript
interface WebAuthoringService {
  createObjectiveFromForm(formData: ObjectiveFormData): Promise<ObjectiveArtifact>
  createAssessmentFromForm(formData: AssessmentFormData): Promise<AssessmentArtifact>
  createLearningExperienceFromForm(formData: LearningExperienceFormData): Promise<LearningExperienceArtifact>
  saveDraft(packageId: string, artifact: CTDLArtifact): Promise<void>
  validateFormData(formData: any, artifactType: ArtifactType): ValidationResult
  linkDependencies(artifactId: string, dependencies: string[]): Promise<void>
}
```

**Validates: Requirements 25.1-25.6, 26.1-26.6, 27.1-27.6**

#### 5. Download Statistics Service

Tracks and reports package download metrics.

**Responsibilities**:
- Record download events (CLI installs, web downloads)
- Aggregate download counts per package and version
- Calculate popularity metrics
- Provide download statistics for display
- Support batch recording for performance

**Key Methods**:
```typescript
interface DownloadStatisticsService {
  recordDownload(packageId: string, version: string, source: DownloadSource): Promise<void>
  getDownloadCounts(packageId: string): Promise<DownloadCounts>
  getDownloadCountsByVersion(packageId: string): Promise<Map<string, number>>
  calculatePopularity(packageId: string): Promise<number>
  getTopDownloadedPackages(limit: number, timeRange?: TimeRange): Promise<PackageDownloadSummary[]>
}

interface DownloadCounts {
  total: number
  last30Days: number
  last7Days: number
  byVersion: Map<string, number>
}

enum DownloadSource {
  CLI = 'cli',
  WEB = 'web',
  CONSUMER_API = 'consumer-api'
}
```

**Validates: Requirements 50.1, 50.2, 50.3, 50.4, 50.5**


#### 6. Platform Metrics Service

Tracks platform-wide usage metrics and provides reporting dashboards.

**Responsibilities**:
- Track publish attempts (successful and failed)
- Track validation failures by type
- Track dependency graph metrics
- Track package reuse metrics
- Track semantic search quality metrics
- Provide organization-level dashboards
- Support administrative metric exports

**Key Methods**:
```typescript
interface PlatformMetricsService {
  recordPublishAttempt(packageId: string, success: boolean, failureReason?: string): Promise<void>
  recordValidationFailure(packageId: string, gateType: QualityGateType, errors: string[]): Promise<void>
  recordDependencyGraphMetrics(packageId: string, depth: number, totalDeps: number): Promise<void>
  recordSearchQuery(query: string, resultCount: number, semantic: boolean): Promise<void>
  getOrganizationMetrics(orgId: string, timeRange: TimeRange): Promise<OrganizationMetrics>
  getPlatformMetrics(timeRange: TimeRange): Promise<PlatformMetrics>
  exportMetrics(format: 'json' | 'csv', timeRange: TimeRange): Promise<string>
}

interface OrganizationMetrics {
  publishAttempts: { successful: number; failed: number }
  validationFailures: Map<QualityGateType, number>
  packageCount: number
  averageDependencyDepth: number
  mostReusedPackages: PackageReuseSummary[]
}

interface PlatformMetrics extends OrganizationMetrics {
  totalUsers: number
  totalOrganizations: number
  searchQueries: { total: number; semantic: number; keyword: number }
  averageSearchResultCount: number
}
```

**Validates: Requirements 53.1, 53.2, 53.3, 53.4, 53.5, 53.6, 53.7**

#### 7. License Validator Service

Validates package license declarations against SPDX standards.

**Responsibilities**:
- Validate SPDX license identifiers
- Support custom license text
- Check license compatibility with dependencies
- Provide license information for display

**Key Methods**:
```typescript
interface LicenseValidatorService {
  validateLicense(license: string): ValidationResult
  isSPDXIdentifier(license: string): boolean
  checkLicenseCompatibility(packageLicense: string, dependencyLicenses: string[]): CompatibilityResult
  getLicenseInfo(spdxId: string): LicenseInfo
}

interface LicenseInfo {
  name: string
  url: string
  osiApproved: boolean
  fsfLibre: boolean
}

interface CompatibilityResult {
  compatible: boolean
  conflicts: LicenseConflict[]
}
```

**Validates: Requirements 59.1, 59.2, 59.5**

#### 8. Keyword Suggestion Service

Suggests relevant keywords for packages based on content analysis.

**Responsibilities**:
- Analyze package content (title, description, competencies)
- Extract relevant keywords
- Suggest popular keywords from similar packages
- Support keyword-based search filtering

**Key Methods**:
```typescript
interface KeywordSuggestionService {
  suggestKeywords(packageContent: PackageContent): Promise<string[]>
  getPopularKeywords(limit: number): Promise<KeywordFrequency[]>
  getRelatedKeywords(keyword: string): Promise<string[]>
  indexKeywords(packageId: string, keywords: string[]): Promise<void>
}

interface PackageContent {
  title: string
  description: string
  competencies: string[]
  learningOutcomes: string[]
}

interface KeywordFrequency {
  keyword: string
  count: number
}
```

**Validates: Requirements 60.5**


#### 9. README Validator Service

Validates package README files for completeness and quality.

**Responsibilities**:
- Check README presence
- Validate Markdown syntax
- Check for required sections
- Validate image and link references
- Index README content for search
- Respect package visibility for indexing

**Key Methods**:
```typescript
interface READMEValidatorService {
  validateREADME(readme: string): ValidationResult
  checkRequiredSections(readme: string): SectionCheckResult
  validateMarkdownSyntax(readme: string): ValidationResult
  validateLinks(readme: string): LinkValidationResult
  validateImages(readme: string): ImageValidationResult
  indexREADMEContent(packageId: string, readme: string, visibility: Visibility): Promise<void>
}

interface SectionCheckResult {
  hasInstallation: boolean
  hasUsage: boolean
  hasExamples: boolean
  missingRecommended: string[]
}

interface LinkValidationResult {
  valid: boolean
  brokenLinks: string[]
}

interface ImageValidationResult {
  valid: boolean
  missingAltText: string[]
  brokenImages: string[]
}
```

**Validates: Requirements 70.1, 70.2, 70.3, 70.4, 70.5, 70.6, 70.7**

#### 10. Channel Manager Service

Manages release channels for packages (stable, beta, prerelease, etc.).

**Responsibilities**:
- Assign packages to channels
- Resolve channel-specific package versions
- Support channel-based installation
- Manage channel metadata

**Key Methods**:
```typescript
interface ChannelManagerService {
  assignToChannel(packageId: string, version: string, channel: string): Promise<void>
  getChannelVersions(packageId: string, channel: string): Promise<string[]>
  getLatestVersionInChannel(packageId: string, channel: string): Promise<string>
  listChannels(packageId: string): Promise<ChannelInfo[]>
  resolveChannelDependency(packageName: string, channel: string): Promise<ResolvedPackage>
}

interface ChannelInfo {
  name: string
  latestVersion: string
  versionCount: number
  description?: string
}
```

**Validates: Requirements 73.1, 73.2, 73.3, 73.4**

#### 11. Dependency Resolver

Resolves package dependencies following the canonical model.

**Responsibilities**:
- Resolve direct and transitive dependencies
- Enforce canonical dependency model constraints
- Handle version constraint resolution (semver ranges)
- Detect circular dependencies
- Generate lockfiles with resolved versions
- Validate dependency graph integrity
- Support channel-based resolution

**Key Methods**:
```typescript
interface DependencyResolver {
  resolveDependencies(manifest: PackageManifest, lockfile?: Lockfile, channel?: string): Promise<ResolvedDependencies>
  validateDependencyModel(packageType: PackageType, dependencies: Dependency[]): ValidationResult
  detectCircularDependencies(packageId: string, dependencies: Dependency[]): CircularDependency[]
  generateLockfile(resolved: ResolvedDependencies): Lockfile
  findCompatibleVersions(packageName: string, constraint: VersionConstraint, channel?: string): Promise<string[]>
}

interface ResolvedDependencies {
  direct: Map<string, ResolvedPackage>
  transitive: Map<string, ResolvedPackage>
  graph: DependencyGraph
}
```

**Validates: Requirements 4.1-4.7, 5.1-5.6, 6.1-6.7, 57.1-57.5, 14.1-14.7**


#### 12. Quality Gate Engine

Executes configurable quality checks before package publication.

**Responsibilities**:
- Execute quality gates in configured order
- Support required, advisory, and disabled gate modes
- Coordinate schema validation, accessibility checks, rubric alignment, security scanning
- Aggregate gate results and determine publication eligibility
- Support per-organization and per-branch gate configuration
- Queue long-running gates as background jobs

**Key Methods**:
```typescript
interface QualityGateEngine {
  executeGates(packageId: string, version: string, config: QualityGateConfig): Promise<QualityGateResults>
  executeGateAsync(packageId: string, version: string, gateType: QualityGateType): Promise<JobId>
  getGateConfiguration(organizationId: string, branch?: string): Promise<QualityGateConfig>
  updateGateConfiguration(organizationId: string, config: QualityGateConfig): Promise<void>
  getGateResults(packageId: string, version: string): Promise<QualityGateResults>
}

interface QualityGateResults {
  passed: boolean
  gates: GateResult[]
  canPublish: boolean
  executedAt: Date
}

interface GateResult {
  name: string
  status: 'passed' | 'failed' | 'advisory' | 'pending'
  mode: 'required' | 'advisory' | 'disabled'
  errors: string[]
  warnings: string[]
  executionTime: number
}
```

**Validates: Requirements 39.1-39.5, 40.1-40.7, 41.1-41.5, 42.1-42.5, 43.1-43.5**

#### 13. Semantic Search Service

Generates embeddings and performs vector similarity search.

**Responsibilities**:
- Generate embeddings for package content (title, description, competencies)
- Store embeddings in pgvector columns
- Perform cosine similarity search
- Combine semantic and keyword search results
- Handle embedding model updates and reindexing
- Support organization-level opt-out for private packages
- Queue embedding generation as background jobs

**Key Methods**:
```typescript
interface SemanticSearchService {
  generateEmbeddings(content: EmbeddingContent): Promise<number[]>
  indexPackage(packageId: string, version: string): Promise<void>
  indexPackageAsync(packageId: string, version: string): Promise<JobId>
  semanticSearch(query: string, filters: SearchFilters): Promise<SearchResult[]>
  reindexAllPackages(modelVersion: string): Promise<void>
  getEmbeddingModelVersion(): string
}

interface EmbeddingContent {
  title: string
  description: string
  competencies: string[]
  learningOutcomes: string[]
}

interface SearchResult {
  packageId: string
  version: string
  similarity: number
  matchedFields: string[]
}
```

**Validates: Requirements 20.1-20.7, 56.1-56.12**


#### 14. Lifecycle Manager

Manages package lifecycle state transitions and enforcement.

**Responsibilities**:
- Enforce valid state transitions
- Integrate with pull request workflow
- Coordinate with quality gate execution
- Track state history for audit
- Support per-version state management

**Key Methods**:
```typescript
interface LifecycleManager {
  transitionState(packageId: string, version: string, targetState: LifecycleState): Promise<StateTransition>
  validateTransition(currentState: LifecycleState, targetState: LifecycleState): boolean
  getValidTransitions(currentState: LifecycleState): LifecycleState[]
  getStateHistory(packageId: string, version: string): Promise<StateTransition[]>
}

interface StateTransition {
  fromState: LifecycleState
  toState: LifecycleState
  timestamp: Date
  actor: User
  reason?: string
}

enum LifecycleState {
  DRAFT = 'draft',
  UNDER_REVIEW = 'under-review',
  APPROVED = 'approved',
  PUBLISHED = 'published',
  DEPRECATED = 'deprecated',
  ARCHIVED = 'archived'
}
```

**Validates: Requirements 35.1-35.10**

#### 15. Pull Request Service

Manages collaborative review workflows.

**Responsibilities**:
- Create and manage pull requests
- Track review status and approvals
- Enforce review requirements (approval thresholds, self-approval rules)
- Merge approved changes
- Notify reviewers and contributors
- Integrate with lifecycle state transitions

**Key Methods**:
```typescript
interface PullRequestService {
  createPullRequest(packageId: string, changes: PackageChanges, metadata: PRMetadata): Promise<PullRequest>
  reviewPullRequest(prId: string, review: Review): Promise<PullRequest>
  mergePullRequest(prId: string): Promise<Package>
  rejectPullRequest(prId: string, reason: string): Promise<PullRequest>
  assignReviewers(prId: string, reviewers: User[]): Promise<PullRequest>
  getOpenPullRequests(packageId: string): Promise<PullRequest[]>
  getReviewConfiguration(organizationId: string): Promise<ReviewConfiguration>
  updateReviewConfiguration(organizationId: string, config: ReviewConfiguration): Promise<void>
}

interface Review {
  reviewer: User
  status: 'approved' | 'rejected' | 'changes-requested'
  comments: Comment[]
}

interface ReviewConfiguration {
  requiredApprovals: number
  allowSelfApproval: boolean
  defaultReviewers: User[]
}
```

**Validates: Requirements 32.1-32.5, 33.1-33.6, 34.1-34.7**

#### 16. Notification Service

Delivers notifications for package events and collaboration activities.

**Responsibilities**:
- Send notifications for dependency deprecation
- Notify on new dependency versions
- Notify on pull request submissions and reviews
- Send security advisories
- Support multiple delivery channels (email, in-app, webhook)
- Respect user notification preferences
- Queue notifications as background jobs
- Retry failed deliveries

**Key Methods**:
```typescript
interface NotificationService {
  notifyDeprecation(packageId: string, version: string, dependents: User[]): Promise<void>
  notifyNewVersion(packageId: string, version: string, subscribers: User[]): Promise<void>
  notifyPullRequest(prId: string, reviewers: User[]): Promise<void>
  notifySecurityAdvisory(packageId: string, version: string, users: User[]): Promise<void>
  notifyUnpublish(packageId: string, version: string, installedUsers: User[]): Promise<void>
  getUserPreferences(userId: string): Promise<NotificationPreferences>
  updatePreferences(userId: string, preferences: NotificationPreferences): Promise<void>
  getNotificationHistory(userId: string, limit: number): Promise<Notification[]>
  queueNotification(notification: NotificationPayload): Promise<JobId>
}

interface NotificationPayload {
  type: NotificationType
  recipients: User[]
  data: object
  priority: 'high' | 'normal' | 'low'
}

enum NotificationType {
  DEPENDENCY_DEPRECATED = 'dependency-deprecated',
  NEW_VERSION = 'new-version',
  PULL_REQUEST = 'pull-request',
  SECURITY_ADVISORY = 'security-advisory',
  PACKAGE_UNPUBLISHED = 'package-unpublished'
}
```

**Validates: Requirements 71.1-71.7**


#### 17. Authentication Service

Handles user authentication and API token management.

**Responsibilities**:
- Authenticate users via email/password and OAuth
- Issue and validate session tokens
- Issue and validate API tokens for CLI
- Manage token lifecycle and revocation
- Support multi-environment token scoping

**Key Methods**:
```typescript
interface AuthenticationService {
  authenticateUser(credentials: Credentials): Promise<AuthToken>
  authenticateOAuth(provider: OAuthProvider, code: string): Promise<AuthToken>
  issueAPIToken(userId: string, environment: Environment): Promise<APIToken>
  validateToken(token: string): Promise<TokenValidation>
  revokeToken(token: string): Promise<void>
  refreshToken(refreshToken: string): Promise<AuthToken>
}
```

**Validates: Requirements 47.1-47.5, 48.1-48.5**

#### 18. Access Control Service

Enforces role-based access control and package visibility.

**Responsibilities**:
- Check user permissions for package operations
- Enforce role-based access (owner, maintainer, contributor, reviewer)
- Enforce package visibility settings (public, organization-private, team-private)
- Validate ownership for state-changing operations
- Handle orphaned package access restrictions

**Key Methods**:
```typescript
interface AccessControlService {
  checkPermission(user: User, packageId: string, operation: Operation): Promise<boolean>
  getUserRole(user: User, packageId: string): Promise<Role | null>
  canAccessPackage(user: User | null, packageId: string): Promise<boolean>
  enforceVisibility(packageId: string, visibility: Visibility): Promise<void>
}

enum Role {
  OWNER = 'owner',
  MAINTAINER = 'maintainer',
  CONTRIBUTOR = 'contributor',
  REVIEWER = 'reviewer'
}

enum Operation {
  READ = 'read',
  EDIT = 'edit',
  PUBLISH = 'publish',
  REVIEW = 'review',
  TRANSFER_OWNERSHIP = 'transfer-ownership'
}
```

**Validates: Requirements 30.1-30.6, 52.1-52.6**

#### 19. Audit Logger

Records all state-changing operations for accountability.

**Responsibilities**:
- Log package publish, deprecation, archival operations
- Log ownership transfers
- Log lifecycle state transitions
- Log permission and role changes
- Log package promotions between environments
- Support queryable audit trail with retention policy
- Handle audit log write failures gracefully

**Key Methods**:
```typescript
interface AuditLogger {
  logPublish(packageId: string, version: string, actor: User): Promise<void>
  logOwnershipTransfer(packageId: string, fromOwner: Owner, toOwner: Owner, actor: User): Promise<void>
  logStateTransition(packageId: string, version: string, transition: StateTransition): Promise<void>
  logPromotion(packageId: string, version: string, fromEnv: Environment, toEnv: Environment, actor: User): Promise<void>
  logPermissionChange(entityId: string, entityType: string, change: PermissionChange, actor: User): Promise<void>
  queryLogs(filters: AuditFilters): Promise<AuditLog[]>
  handleLogFailure(operation: string, error: Error): void
}

interface PermissionChange {
  userId: string
  oldRole?: Role
  newRole?: Role
  action: 'added' | 'removed' | 'modified'
}
```

**Validates: Requirements 69.1-69.9**


#### 20. Forge CLI Client

Command-line interface providing full feature parity for core workflows.

**Responsibilities**:
- Initialize packages and create manifests
- Create CTDL artifacts from templates
- Validate packages locally
- Build and publish packages
- Manage dependencies (add, install, resolve)
- Search and browse packages
- Manage lifecycle states
- Handle pull requests
- Manage organizations and teams
- Inspect quality gate results
- Authenticate with registry

**Key Commands**:
```bash
forge init                          # Initialize new package
forge create <type>                 # Create artifact (objective|assessment|experience)
forge validate                      # Validate package locally
forge build                         # Build package bundle
forge publish                       # Publish to registry
forge install                       # Install dependencies
forge add <package>                 # Add dependency
forge add objective <name>          # Objective-first dependency resolution
forge resolve                       # Resolve dependency conflicts
forge version <major|minor|patch>   # Increment version
forge diff <v1> <v2>                # Compare versions
forge search <query>                # Search packages
forge browse                        # Browse packages
forge lifecycle <version> <state>   # Manage lifecycle state
forge pr create                     # Create pull request
forge pr review <id>                # Review pull request
forge org create <name>             # Create organization
forge team create <org> <name>      # Create team
forge quality-gates <version>       # View quality gate results
```

**Validates: Requirements 7-17, 61-66**



### API Interfaces

#### API Versioning Strategy

All API endpoints are versioned using URL path versioning:
- Current version: `/api/v1/*`
- Consumer API: `/api/consumer/v1/*`
- Version in URL allows independent evolution
- Deprecated versions supported for 12 months after new version release
- Version negotiation via Accept header for future flexibility

#### Pagination Standard

All list endpoints support pagination with consistent parameters:
- `page`: Page number (1-indexed, default: 1)
- `limit`: Items per page (default: 20, max: 100)
- Response includes pagination metadata:
  ```json
  {
    "data": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "totalPages": 8,
      "hasNext": true,
      "hasPrev": false
    }
  }
  ```

#### Rate Limiting

- Internal API: 1000 requests/hour per authenticated user
- Consumer API: 100 requests/hour per IP (unauthenticated), 1000 requests/hour (authenticated)
- Rate limit headers included in all responses:
  - `X-RateLimit-Limit`: Request limit
  - `X-RateLimit-Remaining`: Remaining requests
  - `X-RateLimit-Reset`: Unix timestamp when limit resets
- 429 Too Many Requests returned when limit exceeded

#### Idempotency

- POST/PUT/DELETE operations support idempotency via `Idempotency-Key` header
- Idempotency keys stored for 24 hours
- Duplicate requests with same key return cached response
- Prevents duplicate operations (double publish, double payment, etc.)

#### REST API Endpoints

**Package Management**:
- `POST /api/v1/packages` - Create package
- `GET /api/v1/packages/:id` - Get package details (with caching)
- `GET /api/v1/packages/:id/versions` - List package versions (paginated)
- `GET /api/v1/packages/:id/versions/:version` - Get specific version
- `POST /api/v1/packages/:id/versions/:version/publish` - Publish version
- `PUT /api/v1/packages/:id/versions/:version/lifecycle` - Update lifecycle state
- `POST /api/v1/packages/:id/branches` - Create branch
- `POST /api/v1/packages/:id/merge` - Merge branches
- `PUT /api/v1/packages/:id/owner` - Transfer ownership
- `POST /api/v1/packages/:id/versions/:version/deprecate` - Deprecate version
- `DELETE /api/v1/packages/:id/versions/:version` - Unpublish version (24hr window)
- `GET /api/v1/packages/:id/download-stats` - Get download statistics
- `GET /api/v1/packages/:id/versions/:version/download-url` - Get presigned download URL

**Search and Discovery**:
- `GET /api/v1/packages` - Browse packages (paginated, cached)
- `GET /api/v1/search?q=<query>` - Keyword search (paginated, cached)
- `GET /api/v1/search/semantic?q=<query>` - Semantic search (paginated, cached)
- `GET /api/v1/packages/:id/recommendations` - Get recommendations
- `GET /api/v1/packages/:id/suggested-dependencies` - Get suggested dependencies

**CTDL Rendering**:
- `GET /api/v1/packages/:id/versions/:version/render` - Render all artifacts as HTML
- `GET /api/v1/artifacts/:artifactId/render` - Render specific artifact as HTML
- `GET /api/v1/artifacts/:artifactId/raw` - Get raw CTDL JSON-LD

**Web Authoring**:
- `POST /api/v1/authoring/objectives` - Create objective from form data
- `POST /api/v1/authoring/assessments` - Create assessment from form data
- `POST /api/v1/authoring/experiences` - Create learning experience from form data
- `PUT /api/v1/authoring/drafts/:draftId` - Update draft
- `POST /api/v1/authoring/drafts/:draftId/validate` - Validate draft in real-time

**Dependencies**:
- `POST /api/v1/dependencies/resolve` - Resolve dependency tree
- `GET /api/v1/packages/:id/dependents` - Get dependent packages (paginated)
- `GET /api/v1/packages/:id/dependencies` - Get dependency tree (cached)
- `GET /api/v1/dependencies/suggest?type=<type>&query=<query>` - Suggest dependencies


**Collaboration**:
- `POST /api/v1/pull-requests` - Create pull request
- `GET /api/v1/pull-requests/:id` - Get pull request details
- `POST /api/v1/pull-requests/:id/review` - Submit review
- `POST /api/v1/pull-requests/:id/merge` - Merge pull request
- `POST /api/v1/pull-requests/:id/comments` - Add comment
- `GET /api/v1/packages/:id/pull-requests` - List package PRs (paginated)
- `GET /api/v1/pull-requests/:id/diff` - Get PR diff

**Organizations and Teams**:
- `POST /api/v1/organizations` - Create organization
- `GET /api/v1/organizations/:id` - Get organization details
- `PUT /api/v1/organizations/:id` - Update organization
- `POST /api/v1/organizations/:id/teams` - Create team
- `GET /api/v1/organizations/:id/teams` - List teams (paginated)
- `POST /api/v1/teams/:id/members` - Add team member
- `DELETE /api/v1/teams/:id/members/:userId` - Remove team member
- `GET /api/v1/organizations/:id/packages` - List organization packages (paginated)
- `GET /api/v1/organizations/:id/metrics` - Get organization metrics

**Quality Gates**:
- `GET /api/v1/packages/:id/versions/:version/quality-gates` - Get gate results
- `POST /api/v1/packages/:id/versions/:version/quality-gates/execute` - Trigger gate execution
- `GET /api/v1/organizations/:id/quality-gate-config` - Get gate configuration
- `PUT /api/v1/organizations/:id/quality-gate-config` - Update gate configuration

**Review Configuration**:
- `GET /api/v1/organizations/:id/review-config` - Get review configuration
- `PUT /api/v1/organizations/:id/review-config` - Update review configuration

**Channels**:
- `POST /api/v1/packages/:id/versions/:version/channels` - Assign to channel
- `GET /api/v1/packages/:id/channels` - List package channels
- `GET /api/v1/packages/:id/channels/:channel/versions` - Get versions in channel (paginated)
- `GET /api/v1/packages/:id/channels/:channel/latest` - Get latest version in channel

**Keywords**:
- `GET /api/v1/keywords/popular` - Get popular keywords
- `GET /api/v1/keywords/suggest?content=<content>` - Suggest keywords for content
- `GET /api/v1/keywords/:keyword/related` - Get related keywords

**Notifications**:
- `GET /api/v1/notifications` - Get user notifications (paginated)
- `PUT /api/v1/notifications/:id/read` - Mark notification as read
- `GET /api/v1/notifications/preferences` - Get notification preferences
- `PUT /api/v1/notifications/preferences` - Update notification preferences

**Platform Metrics** (Admin only):
- `GET /api/v1/admin/metrics/platform` - Get platform-wide metrics
- `GET /api/v1/admin/metrics/export` - Export metrics data

**Authentication**:
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/logout` - User logout
- `POST /api/v1/auth/refresh` - Refresh auth token
- `POST /api/v1/auth/oauth/:provider` - OAuth authentication
- `POST /api/v1/auth/tokens` - Issue API token
- `DELETE /api/v1/auth/tokens/:token` - Revoke token
- `GET /api/v1/auth/tokens` - List user's API tokens

**Audit Logs**:
- `GET /api/v1/audit-logs` - Query audit logs (paginated, filtered)
- `GET /api/v1/packages/:id/audit-logs` - Get package audit logs (paginated)

**Environments**:
- `POST /api/v1/packages/:id/versions/:version/promote` - Promote package to environment
- `GET /api/v1/environments` - List available environments
- `GET /api/v1/environments/:env/packages` - List packages in environment (paginated)


**Consumer API** (Read-only, public, isolated):
- `GET /api/consumer/v1/packages` - Browse published packages (paginated, cached)
- `GET /api/consumer/v1/packages/:id` - Get published package (cached)
- `GET /api/consumer/v1/packages/:id/versions/:version` - Get specific version (cached)
- `GET /api/consumer/v1/packages/:id/dependencies` - Get dependency tree (cached)
- `GET /api/consumer/v1/artifacts/:artifactId` - Get specific artifact
- `GET /api/consumer/v1/search?q=<query>` - Search published packages (cached)
- `GET /api/consumer/v1/packages/:id/download` - Download package bundle (presigned URL)

**Consumer API Characteristics**:
- Isolated from internal API for stability
- Separate rate limiting (100 req/hr unauthenticated, 1000 req/hr authenticated)
- Aggressive caching (1-hour TTL for package metadata)
- Only returns published packages (respects visibility)
- Versioned independently from internal API
- Designed for third-party integrations and automation



## Data Models

### Core Entities

#### Package

Represents a versioned, publishable unit containing CTDL artifacts.

```typescript
interface Package {
  id: string                          // UUID
  name: string                        // Unique within scope (e.g., "intro-algebra" or "@org/intro-algebra")
  type: PackageType                   // objective | assessment | learning-experience
  owner: Owner                        // User or Organization
  visibility: Visibility              // public | organization-private | team-private
  repository?: string                 // Git repository URL
  createdAt: Date
  updatedAt: Date
}

enum PackageType {
  OBJECTIVE = 'objective',
  ASSESSMENT = 'assessment',
  LEARNING_EXPERIENCE = 'learning-experience'
}

enum Visibility {
  PUBLIC = 'public',
  ORGANIZATION_PRIVATE = 'organization-private',
  TEAM_PRIVATE = 'team-private'
}

type Owner = User | Organization
```

#### PackageVersion

Represents a specific version of a package. Separated from Package to avoid overloading.

```typescript
interface PackageVersion {
  id: string                          // UUID
  packageId: string                   // Foreign key to Package
  version: string                     // Semantic version (e.g., "1.2.3")
  branch: string                      // Branch name (e.g., "main", "beta")
  lifecycleState: LifecycleState
  checksum: string                    // SHA-256 hash
  bundleUrl: string                   // S3 URL to package bundle
  publishedAt?: Date
  publishedBy?: string                // User ID
  deprecatedAt?: Date
  deprecationMessage?: string
  deprecationAlternative?: string
  parentVersion?: string              // For tracking lineage
  mergeParents?: string[]             // For merge commits
  createdAt: Date
  updatedAt: Date
}
```

#### PackageMetadata

Metadata associated with a package version. Separated for cleaner data model.

```typescript
interface PackageMetadata {
  id: string                          // UUID
  packageVersionId: string            // Foreign key to PackageVersion
  manifest: PackageManifest           // forge.json content
  readme: string                      // Markdown content
  license: string                     // SPDX identifier
  keywords: string[]
  contributors: Contributor[]
  homepage?: string
}
```

#### PackageArtifact

CTDL artifacts associated with a package version. Separated for cleaner queries.

```typescript
interface PackageArtifact {
  id: string                          // UUID
  packageVersionId: string            // Foreign key to PackageVersion
  artifactType: ArtifactType          // objective | assessment | learning-experience
  content: CTDLArtifact               // CTDL JSON-LD (stored as JSONB)
  uri: string                         // Stable artifact URI
  createdAt: Date
}

enum ArtifactType {
  OBJECTIVE = 'objective',
  ASSESSMENT = 'assessment',
  LEARNING_EXPERIENCE = 'learning-experience'
}
```


#### PackageManifest

The forge.json file structure.

```typescript
interface PackageManifest {
  name: string
  version: string
  description: string
  type: PackageType
  license: string                     // SPDX identifier
  keywords: string[]
  repository?: string
  homepage?: string
  contributors: Contributor[]
  dependencies: Record<string, string> // name -> version constraint
  ctdl: CTDLManifest
  publish: PublishConfig
  quality: QualityConfig
}

interface CTDLManifest {
  artifacts: ArtifactReference[]
}

interface ArtifactReference {
  path: string                        // Relative file path
  type: 'objective' | 'assessment' | 'learning-experience'
  id: string                          // Artifact URI
}

interface PublishConfig {
  access: Visibility
  registry?: string                   // Registry URL
  channel?: string                    // Release channel (stable, beta, etc.)
}

interface QualityConfig {
  gates?: Record<string, 'required' | 'advisory' | 'disabled'>
}

interface Contributor {
  name: string
  email?: string
  url?: string
}
```

#### CTDLArtifact

CTDL/CTDL-ASN JSON-LD document stored as JSONB.

```typescript
interface CTDLArtifact {
  '@context': string | object         // JSON-LD context
  '@type': string                     // CTDL type
  '@id': string                       // Stable URI
  [key: string]: any                  // Additional CTDL properties
}
```

#### Dependency

Represents a dependency relationship between packages.

```typescript
interface Dependency {
  id: string                          // UUID
  packageVersionId: string            // Foreign key to PackageVersion
  dependencyName: string              // Package name
  versionConstraint: string           // Semver range (e.g., "^1.2.0")
  resolvedVersion?: string            // Actual version resolved
  dependencyType: DependencyType
  channel?: string                    // Optional channel constraint
}

enum DependencyType {
  OBJECTIVE = 'objective',
  ASSESSMENT = 'assessment',
  LEARNING_EXPERIENCE = 'learning-experience'
}
```

#### Lockfile

Generated file capturing exact resolved dependency versions.

```typescript
interface Lockfile {
  version: string                     // Lockfile format version
  packageName: string
  packageVersion: string
  dependencies: LockedDependency[]
  generatedAt: Date
}

interface LockedDependency {
  name: string
  version: string                     // Exact version
  checksum: string                    // Package checksum
  resolved: string                    // Registry URL
  channel?: string                    // Channel used
  dependencies: LockedDependency[]    // Transitive dependencies
}
```

#### Branch

Represents a development branch for a package.

```typescript
interface Branch {
  id: string                          // UUID
  packageId: string                   // Foreign key to Package
  name: string                        // Branch name
  createdFrom: string                 // Version ID this branch was created from
  createdAt: Date
  createdBy: string                   // User ID
}
```


#### Channel

Represents a release channel for package distribution.

```typescript
interface Channel {
  id: string                          // UUID
  packageId: string                   // Foreign key to Package
  name: string                        // Channel name (stable, beta, prerelease, etc.)
  description?: string
  latestVersion?: string              // Latest version in this channel
  createdAt: Date
  updatedAt: Date
}
```

#### ChannelAssignment

Maps package versions to channels.

```typescript
interface ChannelAssignment {
  id: string                          // UUID
  packageVersionId: string            // Foreign key to PackageVersion
  channelId: string                   // Foreign key to Channel
  assignedAt: Date
  assignedBy: string                  // User ID
}
```

#### User

Represents a platform user.

```typescript
interface User {
  id: string                          // UUID
  email: string
  username: string
  displayName: string
  avatarUrl?: string
  createdAt: Date
  updatedAt: Date
}

interface OAuthProvider {
  id: string                          // UUID
  userId: string                      // Foreign key to User
  provider: string                    // 'github' | 'google' | etc.
  providerId: string
  accessToken: string                 // Encrypted
  createdAt: Date
}

interface APIToken {
  id: string                          // UUID
  userId: string                      // Foreign key to User
  token: string                       // Hashed
  environmentId: string               // Foreign key to Environment
  createdAt: Date
  expiresAt?: Date
  lastUsedAt?: Date
}
```

#### Organization

Represents a group entity that can own packages and manage teams.

```typescript
interface Organization {
  id: string                          // UUID
  name: string                        // Unique, used in scoped package names
  displayName: string
  description?: string
  avatarUrl?: string
  ownerId: string                     // Foreign key to User
  createdAt: Date
  updatedAt: Date
}

interface OrganizationMember {
  id: string                          // UUID
  organizationId: string              // Foreign key to Organization
  userId: string                      // Foreign key to User
  role: Role
  joinedAt: Date
}
```

#### Team

Represents a group of users within an organization.

```typescript
interface Team {
  id: string                          // UUID
  organizationId: string              // Foreign key to Organization
  name: string
  description?: string
  createdAt: Date
  updatedAt: Date
}

interface TeamMember {
  id: string                          // UUID
  teamId: string                      // Foreign key to Team
  userId: string                      // Foreign key to User
  role: Role
  joinedAt: Date
}

interface TeamPackageAssignment {
  id: string                          // UUID
  teamId: string                      // Foreign key to Team
  packageId: string                   // Foreign key to Package
  assignedAt: Date
}
```


#### PullRequest

Represents a proposed change to a package.

```typescript
interface PullRequest {
  id: string                          // UUID
  packageId: string                   // Foreign key to Package
  title: string
  description: string
  authorId: string                    // Foreign key to User
  targetBranch: string
  sourceBranch?: string               // If from a branch
  status: PRStatus
  createdAt: Date
  updatedAt: Date
  mergedAt?: Date
  mergedBy?: string                   // User ID
}

enum PRStatus {
  OPEN = 'open',
  APPROVED = 'approved',
  CHANGES_REQUESTED = 'changes-requested',
  MERGED = 'merged',
  REJECTED = 'rejected'
}

interface PullRequestChange {
  id: string                          // UUID
  pullRequestId: string               // Foreign key to PullRequest
  changeType: 'manifest' | 'artifact' | 'dependency'
  entityId?: string                   // Artifact or dependency ID
  operation: 'added' | 'modified' | 'deleted'
  before?: object                     // JSON diff
  after?: object
}

interface PullRequestReview {
  id: string                          // UUID
  pullRequestId: string               // Foreign key to PullRequest
  reviewerId: string                  // Foreign key to User
  status: 'approved' | 'rejected' | 'changes-requested'
  createdAt: Date
}

interface PullRequestComment {
  id: string                          // UUID
  pullRequestId: string               // Foreign key to PullRequest
  authorId: string                    // Foreign key to User
  content: string
  createdAt: Date
}
```

#### ReviewConfiguration

Configuration for pull request review requirements.

```typescript
interface ReviewConfiguration {
  id: string                          // UUID
  organizationId: string              // Foreign key to Organization
  requiredApprovals: number           // Default: 1
  allowSelfApproval: boolean          // Default: true
  createdAt: Date
  updatedAt: Date
}

interface DefaultReviewer {
  id: string                          // UUID
  reviewConfigId: string              // Foreign key to ReviewConfiguration
  userId: string                      // Foreign key to User
}
```

#### QualityGateResult

Results from quality gate execution.

```typescript
interface QualityGateResult {
  id: string                          // UUID
  packageVersionId: string            // Foreign key to PackageVersion
  gateType: QualityGateType
  status: 'passed' | 'failed' | 'advisory' | 'pending'
  mode: 'required' | 'advisory' | 'disabled'
  errors: string[]
  warnings: string[]
  executionTime: number               // Milliseconds
  executedAt: Date
}

enum QualityGateType {
  SCHEMA_VALIDATION = 'schema-validation',
  ACCESSIBILITY = 'accessibility',
  RUBRIC_ALIGNMENT = 'rubric-alignment',
  SECURITY_SCANNING = 'security-scanning'
}
```

#### QualityGateConfig

Configuration for quality gates per organization.

```typescript
interface QualityGateConfig {
  id: string                          // UUID
  organizationId: string              // Foreign key to Organization
  schemaValidation: GateMode          // Always 'required'
  accessibility: GateMode
  rubricAlignment: GateMode
  securityScanning: GateMode
  createdAt: Date
  updatedAt: Date
}

enum GateMode {
  REQUIRED = 'required',
  ADVISORY = 'advisory',
  DISABLED = 'disabled'
}
```


#### Embedding

Vector embedding for semantic search.

```typescript
interface Embedding {
  id: string                          // UUID
  packageVersionId: string            // Foreign key to PackageVersion
  field: string                       // 'title' | 'description' | 'competency' | 'outcome'
  content: string                     // Original text
  vector: number[]                    // Embedding vector (stored in pgvector column)
  modelVersion: string                // Embedding model identifier
  createdAt: Date
}
```

#### DownloadRecord

Records package download events for statistics.

```typescript
interface DownloadRecord {
  id: string                          // UUID
  packageVersionId: string            // Foreign key to PackageVersion
  userId?: string                     // Foreign key to User (if authenticated)
  source: DownloadSource              // cli | web | consumer-api
  ipAddress: string                   // Hashed for privacy
  userAgent: string
  downloadedAt: Date
}

enum DownloadSource {
  CLI = 'cli',
  WEB = 'web',
  CONSUMER_API = 'consumer-api'
}
```

#### DownloadStatistic

Aggregated download statistics for performance.

```typescript
interface DownloadStatistic {
  id: string                          // UUID
  packageId: string                   // Foreign key to Package
  packageVersionId?: string           // Foreign key to PackageVersion (null for package-level stats)
  period: StatisticPeriod             // daily | weekly | monthly | all-time
  periodStart: Date
  periodEnd: Date
  downloadCount: number
  uniqueUsers: number
  createdAt: Date
}

enum StatisticPeriod {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  ALL_TIME = 'all-time'
}
```

#### MetricEvent

Records platform metric events for aggregation.

```typescript
interface MetricEvent {
  id: string                          // UUID
  eventType: MetricEventType
  entityType: string                  // 'package' | 'organization' | 'user'
  entityId: string
  metadata: object                    // Event-specific data (JSONB)
  timestamp: Date
}

enum MetricEventType {
  PUBLISH_ATTEMPT = 'publish-attempt',
  PUBLISH_SUCCESS = 'publish-success',
  PUBLISH_FAILURE = 'publish-failure',
  VALIDATION_FAILURE = 'validation-failure',
  SEARCH_QUERY = 'search-query',
  DEPENDENCY_RESOLVED = 'dependency-resolved'
}
```

#### PlatformMetric

Aggregated platform metrics for dashboards.

```typescript
interface PlatformMetric {
  id: string                          // UUID
  metricType: string                  // 'publish-attempts' | 'validation-failures' | etc.
  organizationId?: string             // Foreign key to Organization (null for platform-wide)
  period: StatisticPeriod
  periodStart: Date
  periodEnd: Date
  value: number
  metadata: object                    // Metric-specific data (JSONB)
  createdAt: Date
}
```


#### Notification

Represents a notification to be delivered to a user.

```typescript
interface Notification {
  id: string                          // UUID
  userId: string                      // Foreign key to User
  type: NotificationType
  title: string
  message: string
  data: object                        // Notification-specific data (JSONB)
  read: boolean
  deliveryStatus: DeliveryStatus
  createdAt: Date
  readAt?: Date
  deliveredAt?: Date
}

enum NotificationType {
  DEPENDENCY_DEPRECATED = 'dependency-deprecated',
  NEW_VERSION = 'new-version',
  PULL_REQUEST = 'pull-request',
  PULL_REQUEST_REVIEWED = 'pull-request-reviewed',
  SECURITY_ADVISORY = 'security-advisory',
  PACKAGE_UNPUBLISHED = 'package-unpublished'
}

enum DeliveryStatus {
  PENDING = 'pending',
  DELIVERED = 'delivered',
  FAILED = 'failed'
}
```

#### NotificationPreferences

User preferences for notification delivery.

```typescript
interface NotificationPreferences {
  id: string                          // UUID
  userId: string                      // Foreign key to User
  email: boolean
  inApp: boolean
  webhook?: string
  dependencyDeprecation: boolean
  newDependencyVersion: boolean
  pullRequestSubmitted: boolean
  pullRequestReviewed: boolean
  securityAdvisory: boolean
  createdAt: Date
  updatedAt: Date
}
```

#### AuditLog

Records state-changing operations for accountability.

```typescript
interface AuditLog {
  id: string                          // UUID
  timestamp: Date
  actorId: string                     // Foreign key to User
  operation: AuditOperation
  entityType: string                  // 'package' | 'organization' | 'team' | etc.
  entityId: string
  details: object                     // Operation-specific details (JSONB)
  environmentId: string               // Foreign key to Environment
  ipAddress: string                   // Hashed
  userAgent: string
}

enum AuditOperation {
  PACKAGE_PUBLISH = 'package-publish',
  PACKAGE_DEPRECATE = 'package-deprecate',
  PACKAGE_ARCHIVE = 'package-archive',
  PACKAGE_UNPUBLISH = 'package-unpublish',
  OWNERSHIP_TRANSFER = 'ownership-transfer',
  LIFECYCLE_TRANSITION = 'lifecycle-transition',
  PERMISSION_CHANGE = 'permission-change',
  PACKAGE_PROMOTION = 'package-promotion',
  QUALITY_GATE_CONFIG_CHANGE = 'quality-gate-config-change',
  REVIEW_CONFIG_CHANGE = 'review-config-change'
}
```

#### Environment

Represents a registry environment (local, staging, production).

```typescript
interface Environment {
  id: string                          // UUID
  name: string                        // 'local' | 'staging' | 'production'
  registryUrl: string
  createdAt: Date
  updatedAt: Date
}
```

**Note**: Environment is now a simple entity. Package catalogs are implicitly scoped by environment through the `environmentId` field on relevant entities. Quality gate configurations are per-organization, not per-environment.


### Database Schema

**Key Tables**:
- `packages` - Package metadata
- `package_versions` - Versioned package content
- `package_metadata` - Metadata for package versions (manifest, readme, license, keywords)
- `package_artifacts` - CTDL artifacts with JSONB content
- `dependencies` - Dependency relationships
- `branches` - Package branches
- `channels` - Release channels
- `channel_assignments` - Package version to channel mappings
- `users` - User accounts
- `oauth_providers` - OAuth provider connections
- `api_tokens` - API tokens for CLI authentication
- `organizations` - Organization entities
- `organization_members` - User-organization relationships
- `teams` - Teams within organizations
- `team_members` - User-team relationships
- `team_package_assignments` - Team-package access mappings
- `pull_requests` - Pull request metadata
- `pull_request_changes` - Changes in pull requests
- `pull_request_reviews` - Pull request reviews
- `pull_request_comments` - Comments on pull requests
- `review_configurations` - Review requirements per organization
- `default_reviewers` - Default reviewers for organizations
- `quality_gate_results` - Quality gate execution results
- `quality_gate_configs` - Quality gate configurations per organization
- `embeddings` - Vector embeddings (with pgvector column)
- `download_records` - Individual download events
- `download_statistics` - Aggregated download stats
- `metric_events` - Platform metric events
- `platform_metrics` - Aggregated platform metrics
- `notifications` - User notifications
- `notification_preferences` - User notification preferences
- `audit_logs` - Audit trail
- `environments` - Registry environments

**Key Indexes**:
- `packages.name` - Unique index for package name uniqueness
- `package_versions.packageId, version` - Composite index for version lookups
- `package_versions.checksum` - For integrity verification
- `package_artifacts.packageVersionId` - For artifact queries
- `dependencies.packageVersionId, dependencyName` - For dependency resolution
- `embeddings.vector` - pgvector index for similarity search (HNSW or IVFFlat)
- `download_records.packageVersionId, downloadedAt` - For download stats
- `download_statistics.packageId, period, periodStart` - For aggregated stats
- `metric_events.eventType, timestamp` - For metric queries
- `notifications.userId, read, createdAt` - For notification queries
- `audit_logs.timestamp, actorId, operation` - For audit queries
- `audit_logs.entityType, entityId` - For entity-specific audit trails
- `channel_assignments.channelId, packageVersionId` - For channel queries

**Partitioning Strategy**:
- `download_records` - Partitioned by month for performance
- `metric_events` - Partitioned by month for performance
- `audit_logs` - Partitioned by month for performance

**Retention Policies**:
- `download_records` - Retain for 2 years, then archive to cold storage
- `metric_events` - Aggregate to `platform_metrics` daily, retain raw events for 90 days
- `audit_logs` - Retain for 2 years minimum (per requirements)



## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

The following properties define the correctness criteria for CourseForge. Each property is universally quantified and should be validated through property-based testing with a minimum of 100 iterations per test.

### CTDL Compliance Properties

**Property 1: CTDL Artifact Storage Integrity**

*For any* Learning Experience, Objective, or Assessment artifact, when stored in the system, the artifact SHALL remain valid CTDL/CTDL-ASN JSON-LD, SHALL have a stable URI assigned, and SHALL have a versioned identifier that includes the package version.

**Validates: Requirements 1.1, 1.4, 1.5**

**Property 2: CTDL Validation Correctness**

*For any* CTDL artifact, the validation engine SHALL correctly identify whether it conforms to the appropriate CTDL schema, and for invalid artifacts SHALL return error messages containing the specific non-compliant field names.

**Validates: Requirements 2.1, 2.5**

**Property 3: Import/Export Round Trip**

*For any* valid package, exporting then importing SHALL produce an equivalent package with all artifacts and relationships preserved.

**Validates: Requirements 3.3, 3.4**

**Property 4: CTDL Rendering Completeness**

*For any* CTDL artifact, rendering to HTML SHALL include all required CTDL properties in a structured format, and SHALL provide a toggle to view the raw JSON-LD.

**Validates: Requirements 24.1, 24.2, 24.3, 24.4, 24.5**

### Dependency Management Properties

**Property 5: Canonical Dependency Model Enforcement**

*For any* package, the system SHALL allow only valid dependency relationships according to the canonical model (Learning Experiences may depend on Objectives and Assessments, Assessments may depend on Objectives, Objectives may depend on other Objectives), and SHALL reject invalid relationships (Objectives depending on Learning Experiences or Assessments, Assessments depending on Learning Experiences).

**Validates: Requirements 4.1, 4.5, 4.7**

**Property 6: Version Constraint Satisfaction**

*For any* package with declared version constraints, the dependency resolver SHALL only select versions that satisfy all constraints, and SHALL reject invalid semantic versioning syntax.

**Validates: Requirements 5.2, 5.6**

**Property 7: Lockfile Completeness**

*For any* package with resolved dependencies, the generated lockfile SHALL contain all direct and transitive dependencies with their exact versions and checksums.

**Validates: Requirements 6.1, 6.7**

**Property 8: Circular Dependency Detection**

*For any* dependency graph, the system SHALL detect and prevent circular dependency chains before they are created.

**Validates: Requirements 57.3**

**Property 9: Channel-Based Dependency Resolution**

*For any* package with channel-specific dependencies, the dependency resolver SHALL resolve to the latest version in the specified channel, defaulting to stable if no channel is specified.

**Validates: Requirements 14.4, 73.2, 73.3**


### Package Management Properties

**Property 10: Package Name Validation**

*For any* package name, the system SHALL enforce global uniqueness for unscoped names, organization-scoped uniqueness for scoped names, and SHALL validate that names conform to the format rules (lowercase alphanumeric and hyphens, 2-214 characters, no leading/trailing hyphens, not reserved names).

**Validates: Requirements 44.1, 44.5**

**Property 11: Published Version Immutability**

*For any* published package version, the system SHALL prevent all modifications to artifacts, metadata, and dependencies, requiring a new version for any changes.

**Validates: Requirements 45.1**

**Property 12: Manifest Structure Completeness**

*For any* initialized package, the generated manifest SHALL contain all required fields: name, description, type, ctdl, version, license, repository, dependencies, contributors, keywords, publish, and quality.

**Validates: Requirements 7.6**

**Property 13: Artifact Reference Consistency**

*For any* package, after creating a new artifact, the manifest SHALL reference that artifact in its ctdl.artifacts array.

**Validates: Requirements 8.5**

**Property 14: Package Checksum Generation**

*For any* built package, the system SHALL generate checksums for all artifacts and the package bundle, and SHALL verify checksums during download, rejecting packages with mismatched checksums.

**Validates: Requirements 10.3, 58.3**

**Property 15: Semantic Versioning Increment Rules**

*For any* package version, incrementing the major version SHALL reset minor and patch to 0, incrementing minor SHALL reset patch to 0, and incrementing patch SHALL leave major and minor unchanged.

**Validates: Requirements 16.6**

### Lifecycle and State Management Properties

**Property 16: Lifecycle State Transition Enforcement**

*For any* package version, the system SHALL only allow valid state transitions (draft → under-review, under-review → approved or back to draft, approved → published, published → deprecated, deprecated → archived) and SHALL reject invalid transitions.

**Validates: Requirements 35.1**

**Property 17: Version State Independence**

*For any* package with multiple versions, changing the lifecycle state of one version SHALL NOT affect the lifecycle state of any other version.

**Validates: Requirements 35.10**

**Property 18: Quality Gate Publication Blocking**

*For any* package version that fails required quality gates (schema validation, or any organization-configured required gates), the system SHALL prevent publication and SHALL report the specific validation errors.

**Validates: Requirements 39.2**

**Property 19: Unpublish Window Enforcement**

*For any* published package version, unpublishing SHALL succeed if performed within 24 hours of publication and SHALL fail if performed after 24 hours.

**Validates: Requirements 55.1**

### Versioning and Lineage Properties

**Property 20: Artifact Versioned Identifier Format**

*For any* artifact within a package version, the artifact identifier SHALL include the package version string.

**Validates: Requirements 36.1**

**Property 21: Branch Lineage Tracking**

*For any* published package version, the system SHALL record and preserve the source branch from which it was published.

**Validates: Requirements 46.1**

**Property 22: Merge Conflict Detection**

*For any* branch merge operation, the system SHALL detect conflicts by comparing CTDL artifacts and dependencies, and SHALL require manual resolution before completing the merge if conflicts exist.

**Validates: Requirements 38.2**


### Validation and Quality Properties

**Property 23: Validation Completeness**

*For any* package, running validation SHALL check all artifacts in the package against their respective CTDL schemas.

**Validates: Requirements 9.1**

**Property 24: License Requirement Enforcement**

*For any* package, attempting to publish without a specified license SHALL fail validation.

**Validates: Requirements 59.5**

**Property 25: README Requirement Enforcement**

*For any* package, attempting to publish without a README.md file SHALL fail validation.

**Validates: Requirements 70.1, 70.4**

**Property 26: README Link Validation**

*For any* README with external links, validation SHALL check that all links are accessible and SHALL report broken links.

**Validates: Requirements 70.5**

### Semantic Search Properties

**Property 27: Embedding Generation Completeness**

*For any* published package, the system SHALL generate embeddings for the package title, description, and all competency statements and learning outcomes, and SHALL track the embedding model version used.

**Validates: Requirements 56.1, 56.8**

**Property 28: Semantic Search Fallback**

*For any* search query, if embedding generation fails or semantic search infrastructure is unavailable, the system SHALL fall back to keyword-only search and continue to return results.

**Validates: Requirements 20.7**

### Access Control Properties

**Property 29: Visibility Enforcement**

*For any* package with visibility settings (public, organization-private, team-private), the system SHALL enforce these settings on all operations (search, download, view), preventing unauthorized access.

**Validates: Requirements 52.6**

### Environment and Promotion Properties

**Property 30: Package Promotion Preservation**

*For any* package promoted between environments, the system SHALL preserve the version identifier and checksum exactly as they were in the source environment.

**Validates: Requirements 67.2, 67.3**

### Audit and Accountability Properties

**Property 31: Audit Log Completeness**

*For any* state-changing operation (publish, deprecate, archive, unpublish, ownership transfer, lifecycle transition, permission change, promotion), the system SHALL create an audit log entry containing timestamp, actor, operation type, and entity details.

**Validates: Requirements 69.1**

**Property 32: Audit Log Failure Handling**

*For any* state-changing operation, if audit log writing fails, the system SHALL log the failure separately and SHALL NOT block the operation from completing.

**Validates: Error Handling - Audit logging failures**

### Review Workflow Properties

**Property 33: Pull Request Approval Threshold**

*For any* pull request, the system SHALL require at least the configured number of approvals before allowing merge, and SHALL enforce self-approval rules based on organization configuration.

**Validates: Requirements 34.1, 34.3, 34.4, 34.5**

**Property 34: Pull Request Reviewer Notification**

*For any* newly created pull request, the system SHALL notify all assigned reviewers.

**Validates: Requirements 34.6**

**Property 35: Pull Request Merge State Transition**

*For any* approved pull request, merging SHALL create a new package version in draft state that must pass through the standard lifecycle workflow.

**Validates: Requirements 33.5, 38.6**


### Download Statistics Properties

**Property 36: Download Recording Accuracy**

*For any* package download (via CLI, web, or Consumer API), the system SHALL record a download event with the correct package version, source, and timestamp.

**Validates: Requirements 50.4, 50.5**

**Property 37: Download Count Aggregation**

*For any* package, the total download count SHALL equal the sum of download counts across all versions.

**Validates: Requirements 50.2, 50.3**

### Notification Properties

**Property 38: Deprecation Notification Delivery**

*For any* package deprecation, the system SHALL notify all users who depend on that package.

**Validates: Requirements 71.1**

**Property 39: New Version Notification Delivery**

*For any* new package version publication, the system SHALL notify all users who have subscribed to that package.

**Validates: Requirements 71.2**

**Property 40: Pull Request Notification Delivery**

*For any* pull request submission, the system SHALL notify all assigned reviewers.

**Validates: Requirements 71.3**

**Property 41: Notification Preference Respect**

*For any* notification, the system SHALL only deliver via channels enabled in the user's notification preferences.

**Validates: Requirements 71.5**

**Property 42: Unpublish Notification Delivery**

*For any* package unpublish operation, the system SHALL notify all users who have already installed that version.

**Validates: Requirements 55.5**

### Channel Properties

**Property 43: Channel Assignment Uniqueness**

*For any* package version, it MAY be assigned to multiple channels, and each channel SHALL contain at most one version of a given package at any time as the "latest".

**Validates: Requirements 73.1**

**Property 44: Channel Default Behavior**

*For any* package installation without a specified channel, the system SHALL default to the stable channel.

**Validates: Requirements 73.3**

### Web Authoring Properties

**Property 45: Form-to-CTDL Conversion Validity**

*For any* web form submission for creating an artifact, the generated CTDL JSON-LD SHALL be valid according to the appropriate CTDL schema.

**Validates: Requirements 25.4, 26.5, 27.5**

**Property 46: Draft Persistence**

*For any* web-authored artifact, saving as a draft SHALL persist the artifact and allow later editing before publication.

**Validates: Requirements 25.5, 26.6, 27.6**

### Platform Metrics Properties

**Property 47: Publish Attempt Recording**

*For any* package publish attempt (successful or failed), the system SHALL record a metric event with the outcome and failure reason if applicable.

**Validates: Requirements 53.1**

**Property 48: Validation Failure Recording**

*For any* quality gate validation failure, the system SHALL record a metric event with the gate type and error details.

**Validates: Requirements 53.2**



## Error Handling

CourseForge implements comprehensive error handling across all layers to ensure system reliability and provide clear feedback to users.

### Error Categories

**1. Validation Errors**

Occur when user input or package content fails validation checks.

- CTDL schema validation failures
- Package name format violations
- Invalid semantic version constraints
- Missing required manifest fields
- Canonical dependency model violations
- README validation failures
- License validation failures

**Handling Strategy**:
- Return detailed error messages with field paths
- Prevent operation from proceeding
- Log validation failures for metrics
- Provide actionable guidance for correction

**2. State Transition Errors**

Occur when attempting invalid lifecycle state transitions or operations on immutable versions.

- Invalid lifecycle state transitions
- Attempting to modify published versions
- Unpublishing outside 24-hour window
- Publishing without required approvals

**Handling Strategy**:
- Return clear error indicating current state and valid transitions
- Prevent state change
- Log attempted invalid transitions for audit
- Suggest correct workflow

**3. Dependency Resolution Errors**

Occur when dependencies cannot be resolved or contain conflicts.

- Circular dependency detection
- Version constraint conflicts
- Missing dependencies
- Canonical model violations
- Channel resolution failures

**Handling Strategy**:
- Return dependency graph showing conflict location
- Suggest resolution strategies (version constraint relaxation, dependency removal)
- Prevent package build/publish
- Log resolution failures for metrics

**4. Authentication and Authorization Errors**

Occur when users lack required permissions or authentication fails.

- Invalid or expired tokens
- Insufficient permissions for operation
- Orphaned package access attempts
- Visibility violations

**Handling Strategy**:
- Return 401 Unauthorized for authentication failures
- Return 403 Forbidden for authorization failures
- Provide clear message about required permission level
- Do not leak information about private package existence

**5. Quality Gate Failures**

Occur when packages fail required quality checks.

- Schema validation failures
- Accessibility check failures
- Rubric alignment failures
- Security scan detections

**Handling Strategy**:
- Return detailed gate results with specific failures
- Distinguish between required and advisory failures
- Prevent publication for required gate failures
- Allow publication with warnings for advisory failures
- Log all gate executions for metrics

**6. Infrastructure Errors**

Occur when external dependencies fail or system resources are unavailable.

- Database connection failures
- Embedding API failures
- Object storage failures
- Network timeouts
- Redis cache failures

**Handling Strategy**:
- Implement retry logic with exponential backoff (3 retries, 1s/2s/4s delays)
- Fall back to degraded functionality where possible (e.g., keyword-only search, cache bypass)
- Return 503 Service Unavailable for temporary failures
- Log infrastructure errors for monitoring
- Display user-friendly error messages

**7. Conflict Errors**

Occur when concurrent operations conflict or resources already exist.

- Package name conflicts
- Concurrent version modifications
- Branch merge conflicts

**Handling Strategy**:
- Return 409 Conflict with details
- Provide conflict resolution guidance
- For merge conflicts, require manual resolution
- Use optimistic locking for concurrent updates

**8. Rate Limiting Errors**

Occur when users exceed request rate limits.

- Too many requests per hour
- Burst limit exceeded

**Handling Strategy**:
- Return 429 Too Many Requests
- Include Retry-After header with seconds until reset
- Include rate limit headers (X-RateLimit-*)
- Log rate limit violations for abuse detection

**9. Idempotency Errors**

Occur when idempotency key handling fails.

- Duplicate idempotency key with different request body
- Idempotency key expired

**Handling Strategy**:
- Return 409 Conflict for mismatched request body
- Return cached response for matching request
- Log idempotency violations for debugging

**10. Audit Logging Failures**

Occur when audit log writes fail.

- Database write failure
- Disk space exhaustion

**Handling Strategy**:
- Log failure to separate error log
- DO NOT block the operation from completing
- Alert operations team for investigation
- Attempt to write audit log asynchronously with retry


### Error Response Format

All API errors follow a consistent JSON structure:

```typescript
interface ErrorResponse {
  error: {
    code: string                    // Machine-readable error code
    message: string                 // Human-readable error message
    details?: object                // Additional context (field errors, suggestions, etc.)
    timestamp: string               // ISO 8601 timestamp
    requestId: string               // For support and debugging
    retryable: boolean              // Whether the request can be retried
  }
}
```

**Example Error Responses**:

```json
// Validation Error
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Package validation failed",
    "details": {
      "fields": [
        {
          "field": "artifacts[0].@type",
          "message": "Invalid CTDL type: expected 'ceasn:Competency', got 'ceasn:Competency2'"
        }
      ]
    },
    "timestamp": "2024-01-15T10:30:00Z",
    "requestId": "req_abc123",
    "retryable": false
  }
}

// Rate Limit Error
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Please try again later.",
    "details": {
      "limit": 1000,
      "remaining": 0,
      "resetAt": "2024-01-15T11:00:00Z"
    },
    "timestamp": "2024-01-15T10:30:00Z",
    "requestId": "req_abc124",
    "retryable": true
  }
}

// Infrastructure Error
{
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "Semantic search temporarily unavailable. Falling back to keyword search.",
    "details": {
      "service": "embedding-api",
      "fallback": "keyword-search"
    },
    "timestamp": "2024-01-15T10:30:00Z",
    "requestId": "req_abc125",
    "retryable": true
  }
}
```

### CLI Error Handling

The Forge CLI provides user-friendly error messages with:
- Color-coded output (red for errors, yellow for warnings)
- Clear indication of what went wrong
- Actionable suggestions for resolution
- Exit codes indicating error category:
  - 0: Success
  - 1: General error
  - 2: Validation error
  - 3: Authentication error
  - 4: Permission error
  - 5: Network error
  - 6: Dependency resolution error
- Verbose mode for detailed error information (`--verbose` flag)

**Example CLI Error Output**:

```
❌ Error: Package validation failed

The following artifacts have validation errors:

  • artifacts/objective-1.json
    └─ @type: Invalid CTDL type: expected 'ceasn:Competency', got 'ceasn:Competency2'

Suggestion: Check the CTDL schema documentation at https://credreg.net/ctdl/handbook

Run with --verbose for more details.
```

### Graceful Degradation

CourseForge implements graceful degradation for non-critical features:

- **Semantic Search**: Falls back to keyword search if embedding generation fails
- **Recommendations**: Omits recommendation section if semantic search unavailable
- **Notifications**: Queues notifications for retry if delivery fails (3 retries over 24 hours)
- **Audit Logging**: Continues operation even if audit log write fails (logs error separately)
- **Caching**: Bypasses cache if Redis unavailable, queries database directly
- **Background Jobs**: Retries failed jobs with exponential backoff (max 5 retries)

### Error Monitoring and Alerting

- All errors logged to centralized logging system (e.g., Datadog, Sentry)
- Critical errors trigger alerts to operations team
- Error rate monitoring with thresholds:
  - Warning: >1% error rate over 5 minutes
  - Critical: >5% error rate over 5 minutes
- Infrastructure errors trigger immediate alerts
- Audit log write failures trigger immediate alerts



## Testing Strategy

CourseForge employs a comprehensive testing strategy combining unit tests, property-based tests, integration tests, contract tests, end-to-end tests, migration tests, and chaos tests to ensure correctness and reliability.

### Testing Approach

**Dual Testing Philosophy**:
- **Unit Tests**: Verify specific examples, edge cases, and error conditions
- **Property-Based Tests**: Verify universal properties across all inputs through randomization
- Both approaches are complementary and necessary for comprehensive coverage

**Property-Based Testing Balance**:
- Property tests handle comprehensive input coverage through randomization
- Unit tests focus on specific examples that demonstrate correct behavior
- Unit tests validate integration points between components
- Unit tests cover edge cases and error conditions explicitly
- Avoid writing too many unit tests for scenarios already covered by properties

### Property-Based Testing

**Framework**: fast-check (TypeScript/JavaScript property-based testing library)

**Configuration**:
- Minimum 100 iterations per property test (due to randomization)
- Each property test references its design document property
- Tag format: `Feature: courseforge, Property {number}: {property_text}`

**Property Test Implementation Pattern**:

```typescript
import fc from 'fast-check'

// Feature: courseforge, Property 1: CTDL Artifact Storage Integrity
test('CTDL artifacts maintain integrity after storage', () => {
  fc.assert(
    fc.property(
      arbitraryLearningExperienceArtifact(),
      async (artifact) => {
        const stored = await packageService.storeArtifact(artifact)
        
        // Verify valid CTDL JSON-LD
        expect(await ctdlValidator.validateLearningExperience(stored)).toEqual({ valid: true, errors: [] })
        
        // Verify stable URI assigned
        expect(stored['@id']).toBeDefined()
        expect(stored['@id']).toMatch(/^https?:\/\//)
        
        // Verify versioned identifier
        expect(stored['@id']).toContain(artifact.version)
      }
    ),
    { numRuns: 100 }
  )
})
```

**Arbitraries (Generators)**:

CourseForge implements custom arbitraries for domain objects:

- `arbitraryPackageName()` - Generates valid package names (scoped and unscoped)
- `arbitrarySemanticVersion()` - Generates valid semantic versions
- `arbitraryVersionConstraint()` - Generates valid semver ranges
- `arbitraryObjectiveArtifact()` - Generates valid CTDL-ASN Objective artifacts
- `arbitraryAssessmentArtifact()` - Generates valid CTDL Assessment artifacts
- `arbitraryLearningExperienceArtifact()` - Generates valid CTDL Learning Experience artifacts
- `arbitraryDependencyGraph()` - Generates valid dependency graphs
- `arbitraryLifecycleState()` - Generates lifecycle states
- `arbitraryPackageManifest()` - Generates valid package manifests
- `arbitraryChannel()` - Generates channel names
- `arbitraryNotificationPreferences()` - Generates notification preferences

**Property Test Coverage**:

Each of the 48 correctness properties defined in this document MUST have a corresponding property-based test. The test MUST:
1. Generate random valid inputs using arbitraries
2. Execute the operation under test
3. Assert the property holds
4. Run for minimum 100 iterations
5. Include the property tag in a comment


### Unit Testing

**Framework**: Jest (TypeScript/JavaScript testing framework)

**Unit Test Focus Areas**:

1. **Specific Examples**: Demonstrate correct behavior with concrete examples
   - Example: Publishing a specific package with known dependencies
   - Example: Transitioning from draft to under-review state

2. **Edge Cases**: Validate boundary conditions
   - Empty dependency lists
   - Maximum package name length (214 characters)
   - Exactly 24 hours for unpublish window
   - Single-artifact packages
   - Deeply nested dependency trees
   - Empty README files
   - Packages with no keywords

3. **Error Conditions**: Verify error handling
   - Invalid CTDL JSON-LD structure
   - Malformed semantic version strings
   - Circular dependency attempts
   - Unauthorized access attempts
   - Quality gate failures
   - Rate limit violations
   - Idempotency key conflicts

4. **Integration Points**: Validate component interactions
   - Package Service + CTDL Validator integration
   - Dependency Resolver + Package Service integration
   - Quality Gate Engine + Lifecycle Manager integration
   - Authentication Service + Access Control Service integration
   - Notification Service + Pull Request Service integration

**Unit Test Example**:

```typescript
describe('PackageService', () => {
  describe('publishPackage', () => {
    it('should publish an approved package version', async () => {
      const pkg = await createTestPackage({ lifecycleState: 'approved' })
      
      const published = await packageService.publishPackage(pkg.id, pkg.version)
      
      expect(published.lifecycleState).toBe('published')
      expect(published.publishedAt).toBeDefined()
      expect(published.publishedBy).toEqual(testUser.id)
    })
    
    it('should reject publishing a draft package', async () => {
      const pkg = await createTestPackage({ lifecycleState: 'draft' })
      
      await expect(
        packageService.publishPackage(pkg.id, pkg.version)
      ).rejects.toThrow('Cannot publish package in draft state')
    })
    
    it('should record download statistics on publish', async () => {
      const pkg = await createTestPackage({ lifecycleState: 'approved' })
      
      await packageService.publishPackage(pkg.id, pkg.version)
      
      const stats = await downloadStatsService.getDownloadCounts(pkg.id)
      expect(stats.total).toBe(0) // No downloads yet
    })
  })
})
```

### Integration Testing

**Focus**: Validate end-to-end workflows across multiple components

**Key Integration Test Scenarios**:

1. **Package Authoring and Publishing Workflow**
   - Initialize package → Create artifacts → Validate → Build → Publish
   - Verify quality gates execute
   - Verify lifecycle state transitions
   - Verify audit logs created
   - Verify download statistics initialized

2. **Dependency Resolution Workflow**
   - Add dependencies → Resolve → Generate lockfile → Install
   - Verify transitive dependencies resolved
   - Verify version constraints satisfied
   - Verify checksums validated
   - Verify channel-based resolution

3. **Collaboration Workflow**
   - Create pull request → Assign reviewers → Review → Merge
   - Verify notifications sent
   - Verify lifecycle integration
   - Verify audit logs created
   - Verify review configuration enforced

4. **Semantic Search Workflow**
   - Publish package → Generate embeddings → Search → Retrieve results
   - Verify embedding generation
   - Verify similarity ranking
   - Verify fallback to keyword search

5. **Multi-Environment Workflow**
   - Publish to staging → Promote to production
   - Verify quality gates re-executed
   - Verify version and checksum preservation
   - Verify independent catalogs

6. **Web Authoring Workflow**
   - Create artifact via web form → Validate → Save draft → Publish
   - Verify CTDL generation from form data
   - Verify real-time validation
   - Verify draft persistence

7. **Notification Workflow**
   - Trigger event → Queue notification → Deliver notification
   - Verify notification preferences respected
   - Verify retry logic for failed deliveries
   - Verify notification history

**Integration Test Environment**:
- Use test database with pgvector extension
- Mock external APIs (embedding API, OAuth providers)
- Use in-memory object storage for package bundles
- Use test Redis instance for caching
- Reset database state between tests


### Contract Testing

**Framework**: Pact (Consumer-Driven Contract Testing)

**Purpose**: Ensure API contracts between CLI and server remain stable

**Contract Test Scenarios**:

1. **CLI-Server Contracts**
   - Package publish endpoint contract
   - Dependency resolution endpoint contract
   - Search endpoint contract
   - Authentication endpoint contract
   - Quality gate results endpoint contract

2. **Consumer API Contracts**
   - Package retrieval contract
   - Dependency tree contract
   - Search contract
   - Artifact retrieval contract

**Contract Test Process**:
1. CLI defines expected API responses (consumer contract)
2. Server validates it can fulfill contracts (provider verification)
3. Contracts versioned and stored in repository
4. Breaking changes detected automatically
5. Contract tests run on every PR

**Example Contract Test**:

```typescript
// Consumer (CLI) side
describe('Package Publish Contract', () => {
  it('should publish a package', async () => {
    await provider.addInteraction({
      state: 'package is in approved state',
      uponReceiving: 'a request to publish package',
      withRequest: {
        method: 'POST',
        path: '/api/v1/packages/pkg-123/versions/1.0.0/publish',
        headers: { 'Authorization': 'Bearer token' }
      },
      willRespondWith: {
        status: 200,
        body: {
          id: 'pkg-123',
          version: '1.0.0',
          lifecycleState: 'published',
          publishedAt: Matchers.iso8601DateTime()
        }
      }
    })
    
    const result = await cli.publishPackage('pkg-123', '1.0.0')
    expect(result.lifecycleState).toBe('published')
  })
})
```

### End-to-End Testing

**Framework**: Playwright (for web UI) + CLI execution tests

**E2E Test Scenarios**:

1. **Web UI Workflows**
   - User registration and authentication
   - Package browsing and search
   - Web-based package authoring
   - Pull request creation and review
   - Organization and team management
   - Notification viewing and preferences

2. **CLI Workflows**
   - Full package lifecycle via CLI commands
   - Dependency management via CLI
   - Authentication and environment configuration
   - Pull request management via CLI
   - Channel-based installation

3. **Cross-Client Workflows**
   - Create package via CLI, view in web UI
   - Create pull request via web, review via CLI
   - Publish via CLI, download via Consumer API

**E2E Test Environment**:
- Full application stack (Next.js + PostgreSQL + pgvector + Redis)
- Seeded test data
- Isolated test environment per test run
- Real embedding API (or high-fidelity mock)

### Migration Testing

**Purpose**: Ensure database migrations are safe and reversible

**Migration Test Process**:
1. Start with production-like database snapshot
2. Apply migration forward
3. Verify data integrity
4. Run application tests
5. Rollback migration
6. Verify data restored correctly
7. Re-apply migration to test idempotency

**Migration Test Scenarios**:
- Schema changes (add/remove columns, tables)
- Data migrations (transform existing data)
- Index creation (verify performance improvement)
- Constraint changes (verify data validity)

**Example Migration Test**:

```typescript
describe('Migration: Add Channels Table', () => {
  it('should migrate forward successfully', async () => {
    await runMigration('20240115_add_channels_table')
    
    // Verify table exists
    const tables = await db.raw("SELECT tablename FROM pg_tables WHERE schemaname='public'")
    expect(tables.rows.map(r => r.tablename)).toContain('channels')
    
    // Verify existing data intact
    const packages = await db('packages').count()
    expect(packages[0].count).toBe('100') // Seeded data
  })
  
  it('should rollback successfully', async () => {
    await runMigration('20240115_add_channels_table')
    await rollbackMigration('20240115_add_channels_table')
    
    // Verify table removed
    const tables = await db.raw("SELECT tablename FROM pg_tables WHERE schemaname='public'")
    expect(tables.rows.map(r => r.tablename)).not.toContain('channels')
    
    // Verify existing data intact
    const packages = await db('packages').count()
    expect(packages[0].count).toBe('100')
  })
})
```


### Chaos Testing

**Purpose**: Validate system resilience under failure conditions

**Framework**: Custom chaos testing harness + Toxiproxy for network failures

**Chaos Test Scenarios**:

1. **Database Failures**
   - Simulate connection loss during package publish
   - Simulate slow queries during search
   - Simulate transaction rollback failures
   - Verify graceful degradation and error handling

2. **Redis Cache Failures**
   - Simulate cache unavailability
   - Verify fallback to database queries
   - Verify no data loss
   - Verify performance degradation acceptable

3. **Object Storage Failures**
   - Simulate S3 upload failures during publish
   - Simulate download failures during install
   - Verify retry logic
   - Verify error messages to users

4. **Embedding API Failures**
   - Simulate API timeout during embedding generation
   - Simulate API rate limiting
   - Verify fallback to keyword search
   - Verify background job retry logic

5. **Network Partitions**
   - Simulate network partition between app and database
   - Simulate network partition between app and Redis
   - Verify circuit breaker behavior
   - Verify system recovery after partition heals

6. **High Load Scenarios**
   - Simulate 10x normal traffic
   - Verify rate limiting enforcement
   - Verify queue backpressure handling
   - Verify no data corruption under load

**Example Chaos Test**:

```typescript
describe('Chaos: Redis Cache Failure', () => {
  it('should fallback to database when Redis unavailable', async () => {
    // Simulate Redis failure
    await toxiproxy.disable('redis')
    
    // Attempt to fetch package (normally cached)
    const pkg = await packageService.getPackageMetadata('pkg-123')
    
    // Verify data returned correctly
    expect(pkg.name).toBe('test-package')
    
    // Verify fallback logged
    const logs = await getErrorLogs()
    expect(logs).toContainEqual(expect.objectContaining({
      message: 'Redis unavailable, falling back to database',
      service: 'cache'
    }))
    
    // Re-enable Redis
    await toxiproxy.enable('redis')
  })
  
  it('should recover when Redis becomes available', async () => {
    await toxiproxy.disable('redis')
    await packageService.getPackageMetadata('pkg-123')
    
    // Re-enable Redis
    await toxiproxy.enable('redis')
    
    // Verify caching resumes
    await packageService.getPackageMetadata('pkg-123')
    const cacheHit = await redis.get('package:pkg-123')
    expect(cacheHit).toBeDefined()
  })
})
```

### Test Data Management

**Fixtures**: Predefined test data for consistent testing
- Sample CTDL artifacts (valid and invalid)
- Sample package manifests
- Sample dependency graphs
- Sample user and organization data
- Sample notification preferences
- Sample review configurations

**Factories**: Generate test data programmatically
- `createTestPackage()` - Create package with configurable properties
- `createTestUser()` - Create user with configurable roles
- `createTestOrganization()` - Create organization with teams
- `createDependencyGraph()` - Create dependency graph with specified structure
- `createTestChannel()` - Create channel with versions
- `createTestNotification()` - Create notification with preferences

### Continuous Integration

**CI Pipeline**:
1. Lint and type check (TypeScript)
2. Run unit tests (Jest)
3. Run property-based tests (fast-check)
4. Run integration tests
5. Run contract tests (Pact)
6. Run E2E tests (on PR only)
7. Run migration tests
8. Generate coverage report (target: 80% coverage)
9. Run security scanning (npm audit, Snyk)
10. Run chaos tests (nightly only)

**Test Execution Strategy**:
- Unit and property tests run on every commit
- Integration tests run on every commit
- Contract tests run on every commit
- E2E tests run on pull requests and main branch
- Migration tests run on pull requests that modify migrations
- Chaos tests run nightly
- Full test suite runs nightly

### Performance Testing

**Load Testing**: Validate system performance under load
- Simulate concurrent package publishes (100 concurrent)
- Simulate high-volume search queries (1000 req/s)
- Measure API response times
- Verify 95th percentile targets met:
  - API requests: <200ms
  - Keyword search: <500ms
  - Semantic search: <2s

**Embedding Generation Performance**: Validate embedding generation completes within 5 minutes for packages with 100 competencies

**Tools**: k6 or Artillery for load testing

### Security Testing

**Static Analysis**: ESLint security rules, Semgrep

**Dependency Scanning**: npm audit, Snyk

**Penetration Testing**: Manual security review of authentication, authorization, and input validation

**CTDL Injection Testing**: Verify malicious CTDL content is detected by security scanning quality gate

**SQL Injection Testing**: Verify parameterized queries prevent SQL injection

**XSS Testing**: Verify HTML sanitization prevents XSS attacks

