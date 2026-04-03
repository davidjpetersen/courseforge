# CourseForge Connect — Foundation Infrastructure

AWS CDK v2 (TypeScript) stack that provisions the foundational resources for CourseForge Connect.

## Prerequisites

- Node.js >= 18
- AWS CDK CLI (`npm install -g aws-cdk`)
- AWS credentials configured for the target account

## Deployment Steps

```bash
# 1. Install dependencies
cd infra
npm install

# 2. Synthesize the CloudFormation template (validates your CDK code)
npx cdk synth

# 3. Deploy the dev stack
npx cdk deploy FoundationStack-dev \
  --context dev_account=123456789012 \
  --context dev_region=us-east-1

# 4. Deploy the prod stack
npx cdk deploy FoundationStack-prod \
  --context prod_account=987654321098 \
  --context prod_region=us-west-2
```

You can also set context values in `cdk.json` instead of passing them on every command.

## CDK Context Variables

| Variable | Description | Format | Default |
|---|---|---|---|
| `dev_account` | AWS account ID for the dev environment | 12-digit AWS account ID (e.g. `123456789012`) | `REPLACE_WITH_DEV_ACCOUNT` |
| `dev_region` | AWS region for the dev environment | AWS region code (e.g. `us-east-1`) | `us-east-1` |
| `prod_account` | AWS account ID for the prod environment | 12-digit AWS account ID (e.g. `987654321098`) | `REPLACE_WITH_PROD_ACCOUNT` |
| `prod_region` | AWS region for the prod environment | AWS region code (e.g. `us-west-2`) | `us-east-1` |

Context values can be supplied via:
- `cdk.json` — edit the `context` block
- CLI — `--context key=value` flags on `cdk synth` / `cdk deploy`

If a context key is not provided, the CDK app falls back to placeholder values so that `cdk synth` still succeeds for template inspection.

## DynamoDB Single-Table Design

The stack creates a single DynamoDB table named `courseforge-main` using a composite key schema.

### Key Schema

| Key | Type | Description |
|---|---|---|
| `PK` | String | Partition key |
| `SK` | String | Sort key |

### Entity Key Patterns

| Entity | PK | SK |
|---|---|---|
| Workflow | `WF#{workflowId}` | `META` |
| Run | `WF#{workflowId}` | `RUN#{startedAt}#{runId}` |

### Global Secondary Indexes

| GSI Name | Partition Key | Sort Key |
|---|---|---|
| `GSI_TENANT_STATUS` | `tenantId` (String) | `statusUpdatedAt` (String) |
| `GSI_WORKFLOW_RUNS` | `workflowId` (String) | `startedAt` (String) |

### Access Patterns

| Access Pattern | Table / GSI | Key Condition |
|---|---|---|
| Get workflow by ID | Main table | `PK = WF#{workflowId}` AND `SK = META` |
| List runs by workflow | Main table | `PK = WF#{workflowId}` AND `SK begins_with RUN#` |
| List runs by tenant and status | GSI_TENANT_STATUS | `tenantId = {tenantId}` AND `statusUpdatedAt` range |
| Get run by ID | Main table | `PK = WF#{workflowId}` AND `SK = RUN#{startedAt}#{runId}` |

## Secrets Manager Naming Convention

The stack creates a root placeholder secret at `courseforge/connection-root` that serves as an IAM anchor.

Runtime connection secrets follow this naming convention:

```
courseforge/tenant/{tenantId}/connection/{connectionId}
```

IAM policies can grant access using the wildcard path `courseforge/tenant/*` to cover all tenant connection secrets.
