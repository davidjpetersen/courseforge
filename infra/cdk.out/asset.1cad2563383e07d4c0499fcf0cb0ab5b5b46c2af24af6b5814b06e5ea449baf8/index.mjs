// ../functions/execute-step/handler.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";

// ../packages/connectors/http-action/index.ts
import {
  GetSecretValueCommand,
  SecretsManagerClient
} from "@aws-sdk/client-secrets-manager";
var HttpActionError = class extends Error {
  constructor(message, statusCode, responseBody) {
    super(message);
    this.statusCode = statusCode;
    this.responseBody = responseBody;
    this.name = "HttpActionError";
  }
};
var SECRET_PATTERN = /\{\{secret:([^}]+)\}\}/g;
var CONTEXT_PATTERN = /\{\{context\.([^}]+)\}\}/g;
async function resolveSecrets(input, deps, secretValues) {
  let output = input;
  const matches = [...input.matchAll(SECRET_PATTERN)];
  for (const match of matches) {
    const secretId = match[1];
    const response = await deps.secretsClient.send(
      new GetSecretValueCommand({ SecretId: secretId })
    );
    const secretValue = response.SecretString ?? "";
    secretValues.push(secretValue);
    output = output.replace(match[0], secretValue);
  }
  return output;
}
function resolveContext(input, context) {
  return input.replace(CONTEXT_PATTERN, (_, fieldName) => {
    const contextValue = fieldName in context.variables ? context.variables[fieldName] : context[fieldName];
    return contextValue ?? "";
  });
}
function sanitizeLogValue(input, secretValues) {
  return secretValues.reduce(
    (accumulator, secretValue) => secretValue ? accumulator.split(secretValue).join("[REDACTED]") : accumulator,
    input
  );
}
async function resolveTemplate(input, context, deps, secretValues) {
  if (typeof input !== "string") {
    return void 0;
  }
  const withSecrets = await resolveSecrets(input, deps, secretValues);
  return resolveContext(withSecrets, context);
}
function shouldRetry(statusCode) {
  return statusCode >= 500;
}
function responseHeadersToObject(headers) {
  const result = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}
async function executeHttpAction(params, context, deps) {
  const httpClient = deps.httpClient ?? fetch;
  const sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const logger = deps.logger ?? console;
  const secretValues = [];
  const resolvedUrl = await resolveTemplate(params.url, context, deps, secretValues);
  const resolvedBody = await resolveTemplate(params.body, context, deps, secretValues);
  const resolvedHeaders = Object.fromEntries(
    await Promise.all(
      Object.entries(params.headers ?? {}).map(async ([key, value]) => [
        key,
        await resolveTemplate(value, context, deps, secretValues) ?? ""
      ])
    )
  );
  const maxRetries = params.maxRetries ?? 3;
  const initialDelayMs = params.initialDelayMs ?? 200;
  let lastStatusCode = 0;
  let lastResponseBody = "";
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const startedAt = Date.now();
    try {
      const response = await httpClient(resolvedUrl, {
        method: params.method,
        headers: resolvedHeaders,
        body: resolvedBody
      });
      const responseBody = await response.text();
      const durationMs = Date.now() - startedAt;
      logger.log(
        JSON.stringify({
          traceId: context.traceId,
          method: params.method,
          url: sanitizeLogValue(resolvedUrl, secretValues),
          statusCode: response.status,
          attempt,
          durationMs
        })
      );
      if (!response.ok) {
        lastStatusCode = response.status;
        lastResponseBody = responseBody;
        if (attempt < maxRetries && shouldRetry(response.status)) {
          await sleep(initialDelayMs * 2 ** (attempt - 1));
          continue;
        }
        throw new HttpActionError(
          `HTTP action failed with status ${response.status}`,
          response.status,
          responseBody
        );
      }
      return {
        statusCode: response.status,
        headers: responseHeadersToObject(response.headers),
        body: responseBody
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      logger.log(
        JSON.stringify({
          traceId: context.traceId,
          method: params.method,
          url: sanitizeLogValue(resolvedUrl, secretValues),
          statusCode: error instanceof HttpActionError ? error.statusCode : lastStatusCode || 0,
          attempt,
          durationMs
        })
      );
      if (error instanceof HttpActionError) {
        throw error;
      }
      if (attempt < maxRetries) {
        await sleep(initialDelayMs * 2 ** (attempt - 1));
        continue;
      }
      throw new HttpActionError(
        error instanceof Error ? error.message : "HTTP action failed",
        lastStatusCode,
        lastResponseBody
      );
    }
  }
  throw new HttpActionError(
    "HTTP action failed",
    lastStatusCode,
    lastResponseBody
  );
}

// ../functions/shared/connectors.ts
function toConnectorContext(context) {
  const variables = Object.fromEntries(
    Object.entries(context).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)])
  );
  return {
    variables,
    workflowId: typeof context.workflowId === "string" ? context.workflowId : "",
    tenantId: typeof context.tenantId === "string" ? context.tenantId : "",
    traceId: typeof context.traceId === "string" ? context.traceId : ""
  };
}
var runtimeConnectorRegistry = /* @__PURE__ */ new Map([
  [
    "generic-http",
    {
      run: async (params, context) => executeHttpAction(params, toConnectorContext(context), {
        secretsClient: {
          send: async () => ({ SecretString: "" })
        }
      })
    }
  ],
  [
    "echo",
    {
      run: async (params) => params
    }
  ]
]);

// ../functions/shared/keys.ts
var RUN_PREFIX = "RUN#";
var STEP_PREFIX = "STEP#";
function runStepRecordPK(runId) {
  return `${RUN_PREFIX}${runId}`;
}
function runStepRecordSK(stepIndex, stepId) {
  return `${STEP_PREFIX}${String(stepIndex).padStart(4, "0")}#${stepId}`;
}

// ../functions/execute-step/handler.ts
var INLINE_OUTPUT_LIMIT_BYTES = 4 * 1024;
function toRunStepError(error) {
  const value = error;
  return {
    message: error instanceof Error ? error.message : "Step execution failed",
    code: typeof value.code === "string" ? value.code : error instanceof Error ? error.name : "StepExecutionFailed",
    rawResponse: value.rawResponse
  };
}
function getOutputSizeBytes(output) {
  return Buffer.byteLength(JSON.stringify(output), "utf8");
}
function createExecuteStepHandler(deps) {
  const now = deps.clock ?? (() => /* @__PURE__ */ new Date());
  const connectors = deps.connectors ?? runtimeConnectorRegistry;
  const metrics = deps.metrics;
  const tracer = deps.tracer;
  return async (input) => {
    const startedAtIso = now().toISOString();
    const stepKey = {
      PK: runStepRecordPK(input.runId),
      SK: runStepRecordSK(input.step.stepIndex, input.step.stepId)
    };
    await deps.dynamoClient.put({
      TableName: deps.mainTableName,
      Item: {
        ...stepKey,
        runId: input.runId,
        stepId: input.step.stepId,
        stepIndex: input.step.stepIndex,
        connectorKey: input.step.connectorKey,
        status: "RUNNING",
        startedAt: startedAtIso
      }
    });
    const connector = connectors.get(input.step.connectorKey);
    if (!connector) {
      const error = { message: `Unknown connector: ${input.step.connectorKey}`, code: "UnknownConnector" };
      await deps.dynamoClient.update({
        TableName: deps.mainTableName,
        Key: stepKey,
        UpdateExpression: "SET #status = :status, endedAt = :endedAt, #error = :error",
        ExpressionAttributeNames: { "#status": "status", "#error": "error" },
        ExpressionAttributeValues: {
          ":status": "FAILED",
          ":endedAt": now().toISOString(),
          ":error": error
        }
      });
      throw Object.assign(new Error(error.message), { code: error.code, failedStepId: input.step.stepId });
    }
    const startedAtMs = Date.now();
    const subsegment = tracer?.startSubsegment(
      `connector:${input.step.connectorKey}:${input.step.stepId}`
    );
    try {
      const connectorContext = {
        ...input.accumulatedContext,
        tenantId: input.tenantId,
        traceId: input.traceId
      };
      const stepResult = await connector.run(input.step.params, {
        ...connectorContext
      });
      const endedAt = now().toISOString();
      const durationMs = Date.now() - startedAtMs;
      const outputSize = getOutputSizeBytes(stepResult);
      const accumulatedContext = {
        ...input.accumulatedContext,
        [input.step.stepId]: stepResult
      };
      if (outputSize <= INLINE_OUTPUT_LIMIT_BYTES) {
        await deps.dynamoClient.update({
          TableName: deps.mainTableName,
          Key: stepKey,
          UpdateExpression: "SET #status = :status, endedAt = :endedAt, output = :output",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: {
            ":status": "SUCCESS",
            ":endedAt": endedAt,
            ":output": stepResult
          }
        });
      } else {
        const outputRef = `runs/${input.runId}/steps/${input.step.stepId}/output.json`;
        await deps.s3Client.putObject({
          Bucket: deps.artifactBucketName,
          Key: outputRef,
          Body: JSON.stringify(stepResult),
          ContentType: "application/json"
        });
        await deps.dynamoClient.update({
          TableName: deps.mainTableName,
          Key: stepKey,
          UpdateExpression: "SET #status = :status, endedAt = :endedAt, outputRef = :outputRef",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: {
            ":status": "SUCCESS",
            ":endedAt": endedAt,
            ":outputRef": outputRef
          }
        });
      }
      metrics?.putMetric("courseforge/StepSuccess", 1, "Count");
      metrics?.putMetric("courseforge/StepExecutionDuration", durationMs, "Milliseconds");
      subsegment?.close?.();
      return { accumulatedContext, stepResult };
    } catch (error) {
      const runStepError = toRunStepError(error);
      const durationMs = Date.now() - startedAtMs;
      await deps.dynamoClient.update({
        TableName: deps.mainTableName,
        Key: stepKey,
        UpdateExpression: "SET #status = :status, endedAt = :endedAt, #error = :error",
        ExpressionAttributeNames: { "#status": "status", "#error": "error" },
        ExpressionAttributeValues: {
          ":status": "FAILED",
          ":endedAt": now().toISOString(),
          ":error": runStepError
        }
      });
      if (error instanceof Error) {
        subsegment?.addError?.(error);
      }
      metrics?.putMetric("courseforge/StepSuccess", 0, "Count");
      metrics?.putMetric("courseforge/StepExecutionDuration", durationMs, "Milliseconds");
      subsegment?.close?.(error instanceof Error ? error : void 0);
      throw Object.assign(error instanceof Error ? error : new Error(runStepError.message), {
        code: runStepError.code,
        rawResponse: runStepError.rawResponse,
        failedStepId: input.step.stepId
      });
    }
  };
}
var productionHandlerPromise;
async function createProductionTracer() {
  try {
    const awsXray = await import("aws-xray-sdk-core");
    const getSegment = awsXray.getSegment;
    if (!getSegment) {
      return void 0;
    }
    return {
      startSubsegment(name) {
        const segment = getSegment();
        return segment?.addNewSubsegment(name);
      }
    };
  } catch {
    return void 0;
  }
}
async function getProductionHandler() {
  productionHandlerPromise ??= (async () => {
    const { PutObjectCommand, S3Client } = await import("@aws-sdk/client-s3");
    const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
    const s3Client = new S3Client({});
    const tracer = await createProductionTracer();
    return createExecuteStepHandler({
      dynamoClient: {
        async put(params) {
          return dynamoClient.send(new PutCommand(params));
        },
        async update(params) {
          return dynamoClient.send(new UpdateCommand(params));
        }
      },
      s3Client: {
        async putObject(params) {
          return s3Client.send(new PutObjectCommand(params));
        }
      },
      mainTableName: process.env.MAIN_TABLE_NAME ?? "",
      artifactBucketName: process.env.ARTIFACT_BUCKET_NAME ?? "",
      tracer
    });
  })();
  return productionHandlerPromise;
}
async function handler(input) {
  const runtimeHandler = await getProductionHandler();
  return runtimeHandler(input);
}
export {
  createExecuteStepHandler,
  handler
};
