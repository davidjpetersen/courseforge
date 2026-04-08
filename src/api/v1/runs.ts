/**
 * V1 Run handler.
 *
 * GET /api/v1/runs          — list runs (with optional filters and pagination)
 * GET /api/v1/runs/:runId   — get run detail with step summary
 *
 * Thin adapter that validates query params, delegates to the repository,
 * and strips sensitive payload data from responses.
 */

// ── Minimal API Gateway types (matching existing pattern) ──

export interface APIGatewayProxyResult {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
}

// ── Repository interfaces ──

export interface V1RunStep {
  stepId: string;
  stepIndex: number;
  status: string;
  startedAt: string;
  completedAt: string | null;
  rawInput?: Record<string, unknown>;
  rawOutput?: Record<string, unknown>;
}

export interface V1RunRecord {
  runId: string;
  tenantId: string;
  workflowId: string;
  status: string;
  triggerType: string;
  traceId: string;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  payload?: Record<string, unknown>;
  rawPayload?: Record<string, unknown>;
  steps?: V1RunStep[];
}

export interface V1RunRepository {
  list(tenantId: string): Promise<V1RunRecord[]>;
  getById(tenantId: string, runId: string): Promise<V1RunRecord | null>;
}

// ── Helpers ──

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

const DEFAULT_LIMIT = 50;

/**
 * Strip sensitive `payload` from a run record for list responses.
 */
function stripPayload(
  record: V1RunRecord,
): Omit<V1RunRecord, 'payload' | 'rawPayload' | 'steps'> {
  const { payload: _p, rawPayload: _rp, steps: _s, ...rest } = record;
  return rest;
}

/**
 * Strip `rawInput` and `rawOutput` from a step record.
 */
function stripStepPayloads(
  step: V1RunStep,
): Omit<V1RunStep, 'rawInput' | 'rawOutput'> {
  const { rawInput: _ri, rawOutput: _ro, ...rest } = step;
  return rest;
}

/**
 * Strip sensitive data from a run detail: remove `rawPayload` from the run
 * and `rawInput`/`rawOutput` from each step.
 */
function stripDetailPayloads(record: V1RunRecord) {
  const { rawPayload: _rp, payload: _p, steps, ...rest } = record;
  return {
    ...rest,
    steps: (steps ?? []).map(stripStepPayloads),
  };
}

// ── Handler factory ──

export function createV1RunHandler(repo: V1RunRepository) {
  return {
    /**
     * GET /api/v1/runs
     */
    async list(
      tenantId: string,
      query?: Record<string, string | undefined>,
    ): Promise<APIGatewayProxyResult> {
      const runs = await repo.list(tenantId);

      let filtered = runs;

      const workflowIdFilter = query?.workflowId;
      if (workflowIdFilter) {
        filtered = filtered.filter((r) => r.workflowId === workflowIdFilter);
      }

      const statusFilter = query?.status;
      if (statusFilter) {
        filtered = filtered.filter((r) => r.status === statusFilter);
      }

      // Pagination
      const limit = Math.max(1, parseInt(query?.limit ?? '', 10) || DEFAULT_LIMIT);
      const cursor = query?.cursor;

      let startIndex = 0;
      if (cursor) {
        const cursorIdx = filtered.findIndex((r) => r.runId === cursor);
        if (cursorIdx >= 0) {
          startIndex = cursorIdx + 1;
        }
      }

      const page = filtered.slice(startIndex, startIndex + limit);
      const nextCursor = page.length === limit && startIndex + limit < filtered.length
        ? page[page.length - 1].runId
        : undefined;

      const masked = page.map(stripPayload);

      return jsonResponse(200, {
        runs: masked,
        ...(nextCursor ? { cursor: nextCursor } : {}),
      });
    },

    /**
     * GET /api/v1/runs/:runId
     */
    async getById(
      tenantId: string,
      runId: string,
    ): Promise<APIGatewayProxyResult> {
      const run = await repo.getById(tenantId, runId);
      if (!run) {
        return jsonResponse(404, { error: 'Not found' });
      }

      return jsonResponse(200, stripDetailPayloads(run));
    },
  };
}
