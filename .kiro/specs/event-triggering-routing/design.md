# Design Document — Event Triggering & Routing

## Overview

This design covers the infrastructure and application logic needed to trigger CourseForge Connect workflows via HTTP webhooks, cron-based schedules, and domain events, plus a generic HTTP action step connector for outbound API calls during workflow execution.

The system introduces a new CDK `TriggerStack` that provisions an API Gateway HTTP API for webhook ingress, a DynamoDB schedules table, EventBridge Scheduler integration, an EventBridge routing rule with DLQ, and two Lambda functions (`WebhookIngressFn`, `ScheduledTriggerFn`). It also adds an HTTP action step connector module and management APIs for webhook secrets and schedules.

All trigger paths converge on the existing `courseforge-domain` EventBridge bus with source `courseforge.trigger`, which routes events to the `WorkflowRunnerSFN` state machine. This fan-in design keeps the workflow execution path uniform regardless of trigger type.

## Architecture

```mermaid
flowchart TB
    subgraph External
        Caller["External System"]
        Cron["EventBridge Scheduler"]
    end

    subgraph TriggerStack
        APIGW["API Gateway HTTP API\ncourseforge-webhook-api"]
        WebhookFn["WebhookIngressFn\nLambda (10s)"]
        ScheduledFn["ScheduledTriggerFn\nLambda"]
        DLQ["SQS DLQ\ncourseforge-trigger-dlq"]
    end

    subgraph FoundationStack
        EventBus["EventBridge Bus\ncourseforge-domain"]
        MainTable["DynamoDB\ncourseforge-main"]
        SchedulesTable["DynamoDB\ncourseforge-schedules"]
    end

    subgraph Downstream
        Rule["EventBridge Rule\nsource: courseforge.trigger"]
        Runner["WorkflowRunnerSFN"]
    end

    Caller -->|POST /webhook/{workflowId}| APIGW
    APIGW --> WebhookFn
    Cron --> ScheduledFn

    WebhookFn -->|PutEvents| EventBus
    WebhookFn -->|GetItem / PutItem| MainTable
    ScheduledFn -->|PutEvents| EventBus
    ScheduledFn -->|GetItem / PutItem| MainTable
    ScheduledFn -->|UpdateItem| SchedulesTable

    EventBus --> Rule
    Rule --> Runner
    Rule -.->|on failure| DLQ
```

### Key Design Decisions

1. **Fan-in to EventBridge**: All trigger types publish to the same EventBridge bus with source `courseforge.trigger`. This decouples trigger ingestion from workflow execution and allows adding new trigger types without modifying the runner.

2. **Separate Schedules Table**: Schedule records live in `courseforge-schedules` rather than the main table because schedule metadata (cron expression, schedule group membership) is operationally distinct from workflow/run data and benefits from independent scaling.

3. **Webhook secret hashing**: Raw tokens are never stored. Only SHA-256 hashes are persisted in the main table, and the raw token is returned exactly once at creation time. This follows the same pattern as GitHub webhook secrets.

4. **Handler factory pattern**: All new Lambda handlers follow the existing dependency-injection factory pattern (see `createPublishHandler`, `createStepTestHandler`) for testability.

5. **HTTP Action Connector as pure module**: The connector is a standalone module in `packages/connectors/` with no Lambda coupling, making it callable from Step Functions tasks, Lambda handlers, or tests.

## Components and Interfaces

### 1. TriggerStack (CDK)

**File**: `infra/lib/trigger-stack.ts`

Provisions all trigger infrastructure. Accepts references to the foundation stack's event bus and main table via props.

```typescript
interface TriggerStackProps extends cdk.StackProps {
  eventBus: events.IEventBus;
  mainTable: dynamodb.ITable;
}
```

Resources created:
- API Gateway HTTP API (`courseforge-webhook-api`) with `POST /webhook/{workflowId}` route
- DynamoDB table (`courseforge-schedules`) with PK/SK
- EventBridge Scheduler group (`courseforge-schedules`)
- EventBridge rule on `courseforge-domain` matching `source: "courseforge.trigger"` → WorkflowRunnerSFN target
- SQS DLQ (`courseforge-trigger-dlq`) as failure destination on the rule target
- WebhookIngressFn Lambda (10s timeout)
- ScheduledTriggerFn Lambda

### 2. WebhookIngressFn

**File**: `functions/webhook-ingress/handler.ts`

Factory function: `createWebhookIngressHandler(deps)`

```typescript
interface WebhookIngressDeps {
  dynamoClient: DynamoDBDocumentClient;
  eventBridgeClient: EventBridgeClient;
  mainTableName: string;
  eventBusName: string;
}

interface WebhookIngressResult {
  statusCode: number;
  body: string;
}
```

Flow:
1. Extract `workflowId` from path params → 400 if missing
2. Extract `tenantId` and bearer token from `Authorization` header → 401 if missing/malformed
3. SHA-256 hash the token, compare against stored hash at `PK=TENANT#{tenantId}, SK=WEBHOOK_SECRET#{workflowId}` → 401 if mismatch
4. Query workflow status at `PK=WF#{workflowId}, SK=META` → 409 if not PUBLISHED
5. Parse request body as JSON → 400 if invalid
6. Generate `traceId` (UUID v4) and `runId` (UUID v4)
7. PutEvents to EventBridge (source: `courseforge.trigger`, detail-type: `WebhookReceived`)
8. PutItem run record to main table
9. Return 202 with `{ runId, traceId }`

### 3. ScheduledTriggerFn

**File**: `functions/scheduled-trigger/handler.ts`

Factory function: `createScheduledTriggerHandler(deps)`

```typescript
interface ScheduledTriggerDeps {
  dynamoClient: DynamoDBDocumentClient;
  eventBridgeClient: EventBridgeClient;
  mainTableName: string;
  schedulesTableName: string;
  eventBusName: string;
}
```

Flow:
1. Extract `workflowId`, `tenantId`, `scheduleId` from scheduler event payload
2. Query workflow status → log warning and return if not PUBLISHED
3. Generate `traceId` and `runId`
4. PutEvents to EventBridge (source: `courseforge.trigger`, detail-type: `ScheduleTriggered`)
5. PutItem run record with `triggerType: "scheduled"`
6. UpdateItem schedule record `lastRunAt` in schedules table
7. Return success

### 4. HTTP Action Step Connector

**File**: `packages/connectors/http-action/index.ts`

```typescript
interface HttpActionParams {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  body?: string;
  maxRetries?: number;       // default: 3
  initialDelayMs?: number;   // default: 200
}

interface ConnectorContext {
  variables: Record<string, string>;
  workflowId: string;
  tenantId: string;
  traceId: string;
}

interface HttpActionResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

class HttpActionError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody: string,
  ) { super(message); this.name = 'HttpActionError'; }
}

function executeHttpAction(
  params: HttpActionParams,
  context: ConnectorContext,
  deps: { secretsClient: SecretsManagerClient; httpClient?: typeof fetch },
): Promise<HttpActionResult>;
```

Template resolution:
- `{{secret:arn:aws:secretsmanager:...}}` → resolved from Secrets Manager
- `{{context.fieldName}}` → resolved from `ConnectorContext.variables`

Retry: exponential backoff (`initialDelayMs * 2^attempt`) up to `maxRetries`. Only retries on 5xx or network errors.

Logging: structured JSON with `traceId`, `method`, `url`, `statusCode`, `attempt`, `durationMs`. Secret values are replaced with `[REDACTED]` in all log output.

### 5. Trigger Management API Handlers

**Files**: `src/api/triggers/webhook-secret.ts`, `src/api/triggers/schedule.ts`

Follow the existing handler factory pattern.

#### Webhook Secret Handler

```typescript
function createWebhookSecretHandler(deps: {
  dynamoClient: DynamoDBDocumentClient;
  mainTableName: string;
}): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
```

- POST `/api/workflows/:workflowId/webhook-secret`
- Generates 32-byte random token via `crypto.randomBytes(32)`
- Stores SHA-256 hash at `PK=TENANT#{tenantId}, SK=WEBHOOK_SECRET#{workflowId}`
- Returns raw token once in response

#### Schedule Handlers

```typescript
function createCreateScheduleHandler(deps: {
  dynamoClient: DynamoDBDocumentClient;
  schedulerClient: SchedulerClient;
  schedulesTableName: string;
  scheduleGroupName: string;
  targetArn: string;
  targetRoleArn: string;
}): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;

function createDeleteScheduleHandler(deps: {
  dynamoClient: DynamoDBDocumentClient;
  schedulerClient: SchedulerClient;
  schedulesTableName: string;
  scheduleGroupName: string;
}): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
```

- POST `/api/workflows/:workflowId/schedule` — validates cron, rejects < 15min intervals, creates EventBridge Scheduler schedule + DynamoDB record, returns plain-language preview
- DELETE `/api/workflows/:workflowId/schedule/:scheduleId` — deletes EventBridge schedule, soft-deletes DynamoDB record with `deletedAt` timestamp, returns 404 if not found


## Data Models

### Existing Entities (Extended)

#### Webhook Secret Record (Main Table)

| Attribute | Type | Description |
|---|---|---|
| PK | String | `TENANT#{tenantId}` |
| SK | String | `WEBHOOK_SECRET#{workflowId}` |
| tokenHash | String | SHA-256 hex digest of the bearer token |
| createdAt | String | ISO 8601 timestamp |
| updatedAt | String | ISO 8601 timestamp |

#### Run Record (Main Table — extended with triggerType)

| Attribute | Type | Description |
|---|---|---|
| PK | String | `TENANT#{tenantId}` |
| SK | String | `RUN#{timestamp}#{runId}` |
| workflowId | String | Workflow identifier |
| tenantId | String | Tenant identifier |
| runId | String | UUID v4 |
| traceId | String | UUID v4 |
| triggerType | String | `webhook` \| `scheduled` \| `manual` |
| status | String | RunStatus enum value |
| startedAt | String | ISO 8601 timestamp |
| workflowId | String | (GSI_WORKFLOW_RUNS partition key) |

### New Entities

#### Schedule Record (Schedules Table)

| Attribute | Type | Description |
|---|---|---|
| PK | String | `WORKFLOW#{workflowId}` |
| SK | String | `SCHEDULE#{scheduleId}` |
| tenantId | String | Tenant identifier |
| workflowId | String | Workflow identifier |
| scheduleId | String | UUID v4 |
| cronExpression | String | AWS cron expression |
| previewText | String | Human-readable schedule description |
| schedulerArn | String | ARN of the EventBridge Scheduler schedule |
| createdAt | String | ISO 8601 timestamp |
| lastRunAt | String \| null | ISO 8601 timestamp of last execution |
| deletedAt | String \| null | ISO 8601 timestamp for soft-delete |

### Domain Event Payloads

All trigger events conform to the existing `DomainEvent` interface from `packages/types`:

```typescript
// WebhookReceived event
{
  tenantId: string;
  workflowId: string;
  eventType: "WebhookReceived";
  payload: unknown;        // parsed webhook request body
  traceId: string;         // UUID v4
  timestamp: string;       // ISO 8601
}

// ScheduleTriggered event
{
  tenantId: string;
  workflowId: string;
  eventType: "ScheduleTriggered";
  payload: {
    scheduleId: string;
    cronExpression: string;
  };
  traceId: string;
  timestamp: string;
}
```

EventBridge envelope:
- `Source`: `courseforge.trigger`
- `DetailType`: `WebhookReceived` | `ScheduleTriggered`
- `Detail`: JSON-serialized `DomainEvent`
- `EventBusName`: `courseforge-domain`

### TypeScript Types (New)

```typescript
// packages/connectors/http-action/index.ts
interface HttpActionParams {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  body?: string;
  maxRetries?: number;
  initialDelayMs?: number;
}

interface ConnectorContext {
  variables: Record<string, string>;
  workflowId: string;
  tenantId: string;
  traceId: string;
}

interface HttpActionResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

// functions/webhook-ingress/handler.ts
interface WebhookIngressEvent {
  pathParameters: { workflowId: string };
  headers: Record<string, string>;
  body: string | null;
}

// functions/scheduled-trigger/handler.ts
interface SchedulerEvent {
  workflowId: string;
  tenantId: string;
  scheduleId: string;
}
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Webhook authentication correctness

*For any* bearer token and stored SHA-256 hash, the WebhookIngressFn should return 202 if and only if SHA-256(token) equals the stored hash, and 401 otherwise. For any random token that does not match the stored hash, the response must be 401.

**Validates: Requirements 4.2, 4.3**

### Property 2: Non-PUBLISHED workflow rejection (webhook)

*For any* workflow status that is not `PUBLISHED` (i.e., DRAFT, PAUSED, or ARCHIVED), the WebhookIngressFn should return a 409 Conflict response after successful authentication, without publishing any event or writing any run record.

**Validates: Requirements 5.1, 5.2**

### Property 3: Successful webhook processing produces complete outputs

*For any* valid authenticated request to a PUBLISHED workflow with a valid JSON body, the WebhookIngressFn should: publish a DomainEvent to EventBridge with source `courseforge.trigger` and detail-type `WebhookReceived`, write a Run_Record to the main table with the correct key pattern (`TENANT#{tenantId}`, `RUN#{timestamp}#{runId}`), and return a 202 response containing both `runId` and `traceId` as valid UUID v4 strings.

**Validates: Requirements 5.5, 5.6, 5.7, 5.8**

### Property 4: Non-PUBLISHED workflow silent return (scheduled)

*For any* scheduler event targeting a workflow whose status is not `PUBLISHED`, the ScheduledTriggerFn should return without error and without publishing any DomainEvent or writing any Run_Record.

**Validates: Requirements 6.1, 6.2**

### Property 5: Successful scheduled trigger produces complete outputs

*For any* valid scheduler event targeting a PUBLISHED workflow, the ScheduledTriggerFn should: publish a DomainEvent with source `courseforge.trigger` and detail-type `ScheduleTriggered`, write a Run_Record with `triggerType` set to `scheduled`, update the schedule record's `lastRunAt` field in the schedules table, and return without error.

**Validates: Requirements 6.3, 6.4, 6.5, 6.6, 6.7**

### Property 6: Template reference resolution

*For any* `HttpActionParams` containing `{{secret:ARN}}` or `{{context.field}}` placeholders, the HTTP Action Connector should resolve all placeholders to their corresponding values (from Secrets Manager and ConnectorContext respectively) before executing the HTTP request, such that the final request URL, headers, and body contain no unresolved template references.

**Validates: Requirements 7.2, 7.3**

### Property 7: Retry with exponential backoff and error propagation

*For any* HTTP request that returns a 5xx status code, and a configured `maxRetries` value of N, the HTTP Action Connector should make exactly N + 1 total attempts with exponential backoff delays. If all attempts fail, it should throw an `HttpActionError` containing the status code and response body from the final attempt.

**Validates: Requirements 7.4, 7.5**

### Property 8: Secret exclusion from logs

*For any* HTTP request attempt where secret values have been resolved, the structured JSON log entries produced by the HTTP Action Connector should not contain any resolved secret values. All secret values should appear as `[REDACTED]` in log output.

**Validates: Requirements 7.6, 7.7**

### Property 9: Webhook secret hash round-trip

*For any* webhook secret creation request, the SHA-256 hash of the returned raw token should equal the hash value stored in the main table. The stored record should contain only the hash, never the raw token.

**Validates: Requirements 8.1, 8.2, 8.3**

### Property 10: Cron expression syntax validation

*For any* string input, the cron validator should accept strings that conform to valid AWS cron expression syntax and reject strings that do not.

**Validates: Requirements 9.1**

### Property 11: Minimum schedule interval enforcement

*For any* valid cron expression that specifies a recurrence interval shorter than 15 minutes, the schedule creation handler should return a 400 Bad Request response.

**Validates: Requirements 9.2**

### Property 12: Schedule creation produces complete outputs

*For any* valid cron expression with interval ≥ 15 minutes, the schedule creation handler should: create an EventBridge Scheduler schedule in the `courseforge-schedules` group, write a schedule record to the schedules table with PK `WORKFLOW#{workflowId}` and SK `SCHEDULE#{scheduleId}`, and return a non-empty plain-language preview string.

**Validates: Requirements 9.3, 9.4, 9.5**

### Property 13: Schedule deletion soft-deletes record

*For any* existing schedule, the delete handler should remove the EventBridge Scheduler schedule and set a `deletedAt` ISO 8601 timestamp on the DynamoDB schedule record rather than physically deleting it.

**Validates: Requirements 10.1, 10.2**

### Property 14: DomainEvent structure conformance

*For any* DomainEvent published by either the WebhookIngressFn or ScheduledTriggerFn, the event should contain all required fields (`tenantId`, `workflowId`, `eventType`, `payload`, `traceId`, `timestamp`) where `timestamp` is a valid ISO 8601 string and `traceId` is a valid UUID v4, conforming to the existing `DomainEvent` interface.

**Validates: Requirements 11.1, 11.2**

### Property 15: DomainEvent serialization round-trip

*For any* valid DomainEvent object, serializing it to JSON and then parsing it back should produce an object deeply equal to the original.

**Validates: Requirements 11.3**

## Error Handling

### WebhookIngressFn

| Condition | Response | Side Effects |
|---|---|---|
| Missing `workflowId` path param | 400 Bad Request | None |
| Missing/malformed `Authorization` header | 401 Unauthorized | None |
| Bearer token hash mismatch | 401 Unauthorized | None |
| Workflow not found or not PUBLISHED | 409 Conflict | None |
| Invalid JSON body | 400 Bad Request | None |
| EventBridge PutEvents failure | 500 Internal Server Error | Log error with traceId |
| DynamoDB write failure | 500 Internal Server Error | Log error with traceId; event may already be published (at-least-once) |

### ScheduledTriggerFn

| Condition | Response | Side Effects |
|---|---|---|
| Workflow not PUBLISHED | Success (no-op) | Log warning with workflowId, scheduleId |
| EventBridge PutEvents failure | Throw (scheduler retries) | Log error |
| DynamoDB write failure | Throw (scheduler retries) | Log error; event may already be published |

### HTTP Action Connector

| Condition | Behavior |
|---|---|
| Secret resolution failure | Throw immediately (no retry) |
| Context variable not found | Throw immediately (no retry) |
| HTTP 4xx response | Return result (no retry) |
| HTTP 5xx response | Retry with exponential backoff |
| Network error / timeout | Retry with exponential backoff |
| All retries exhausted | Throw `HttpActionError` with final status and body |

### Schedule Management API

| Condition | Response |
|---|---|
| Invalid cron syntax | 400 Bad Request with validation message |
| Interval < 15 minutes | 400 Bad Request with minimum interval message |
| Schedule not found (DELETE) | 404 Not Found |
| EventBridge Scheduler API failure | 500 Internal Server Error |

## Testing Strategy

### Test Framework and Libraries

- **Test runner**: Vitest (already in use across the project)
- **Property-based testing**: fast-check (already a devDependency)
- **Mocking**: Vitest built-in `vi.fn()` for dependency injection mocks

### Unit Tests

Unit tests verify specific examples, edge cases, and error conditions. They complement property tests by covering concrete scenarios.

**WebhookIngressFn** (`functions/webhook-ingress/handler.test.ts`):
- Valid authenticated request → 202 with runId and traceId
- Invalid bearer token → 401
- Missing Authorization header → 401
- Missing workflowId → 400
- Non-PUBLISHED workflow → 409
- Invalid JSON body → 400
- DomainEvent published to EventBridge on success
- Run_Record written to DynamoDB on success

**ScheduledTriggerFn** (`functions/scheduled-trigger/handler.test.ts`):
- Valid PUBLISHED workflow → event published, run record written, lastRunAt updated
- Non-PUBLISHED workflow → no event, no run record, no error

**HTTP Action Connector** (`packages/connectors/http-action/index.test.ts`):
- Successful GET/POST request
- Secret reference resolution
- Context variable resolution
- 5xx triggers retry
- 4xx does not trigger retry
- All retries exhausted → HttpActionError

**Trigger Management API** (`src/api/triggers/webhook-secret.test.ts`, `src/api/triggers/schedule.test.ts`):
- Webhook secret creation returns 32-byte token
- Schedule creation with valid cron
- Schedule creation with invalid cron → 400
- Schedule creation with < 15min interval → 400
- Schedule deletion → soft-delete
- Schedule deletion for non-existent → 404

### Property-Based Tests

Each property test references its design document property and runs a minimum of 100 iterations. Tests use fast-check for input generation.

Each property-based test MUST be tagged with a comment in the format:
`// Feature: event-triggering-routing, Property {number}: {property_text}`

Each correctness property is implemented by a single property-based test.

**WebhookIngressFn** (`functions/webhook-ingress/handler.property.test.ts`):
- Property 1: Webhook authentication correctness
- Property 2: Non-PUBLISHED workflow rejection
- Property 3: Successful webhook processing produces complete outputs
- Property 14: DomainEvent structure conformance (webhook path)
- Property 15: DomainEvent serialization round-trip

**ScheduledTriggerFn** (`functions/scheduled-trigger/handler.property.test.ts`):
- Property 4: Non-PUBLISHED workflow silent return
- Property 5: Successful scheduled trigger produces complete outputs
- Property 14: DomainEvent structure conformance (scheduled path)

**HTTP Action Connector** (`packages/connectors/http-action/index.property.test.ts`):
- Property 6: Template reference resolution
- Property 7: Retry with exponential backoff and error propagation
- Property 8: Secret exclusion from logs

**Trigger Management API** (`src/api/triggers/webhook-secret.property.test.ts`, `src/api/triggers/schedule.property.test.ts`):
- Property 9: Webhook secret hash round-trip
- Property 10: Cron expression syntax validation
- Property 11: Minimum schedule interval enforcement
- Property 12: Schedule creation produces complete outputs
- Property 13: Schedule deletion soft-deletes record

### CDK Infrastructure Tests

CDK assertion tests (`infra/test/trigger-stack.test.ts`) verify synthesized CloudFormation templates:
- API Gateway HTTP API with correct name and route
- DynamoDB schedules table with correct key schema
- EventBridge Scheduler group
- EventBridge rule with correct source pattern and SFN target
- SQS DLQ with correct name
- Lambda functions with correct timeouts
- CloudFormation output for webhook base URL

