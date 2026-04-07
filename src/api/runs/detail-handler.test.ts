import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRunDetailHandler, S3Client } from './detail-handler.js';
import type { RunRepository } from './handler.js';
import type { APIGatewayProxyEvent } from '../triggers/shared.js';
import type { Run, RunStep } from '../../../packages/types/src/runs.js';

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/api/runs/run-1',
    headers: { 'x-tenant-id': 'tenant-1' },
    pathParameters: { runId: 'run-1' },
    queryStringParameters: null,
    ...overrides,
  };
}

function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    runId: 'run-1',
    workflowId: 'wf-1',
    workflowName: 'Test Workflow',
    tenantId: 'tenant-1',
    versionId: 'v1',
    status: 'SUCCESS',
    triggerType: 'webhook',
    triggerEventId: 'evt-1',
    startedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeStep(overrides: Partial<RunStep> & { outputRef?: string } = {}): RunStep & { outputRef?: string } {
  return {
    stepId: 'step-1',
    stepIndex: 0,
    label: 'Step 1',
    connectorKey: 'http-action',
    status: 'SUCCESS',
    startedAt: '2024-01-01T00:00:01Z',
    inputSummary: '{"url":"https://example.com"}',
    outputSummary: '{"result":"ok"}',
    ...overrides,
  };
}

function makeMockRepo(): RunRepository {
  return {
    queryByTenant: vi.fn().mockResolvedValue({ items: [], lastKey: undefined }),
    queryByWorkflow: vi.fn().mockResolvedValue({ items: [], lastKey: undefined }),
    queryByTenantStatus: vi.fn().mockResolvedValue({ items: [], lastKey: undefined }),
    getById: vi.fn().mockResolvedValue(null),
    getSteps: vi.fn().mockResolvedValue([]),
  };
}

function makeMockS3(): S3Client {
  return {
    getObjectTruncated: vi.fn().mockResolvedValue('{"fetched":"from-s3"}'),
  };
}

describe('createRunDetailHandler', () => {
  let mockRepo: RunRepository;
  let mockS3: S3Client;
  const bucket = 'test-bucket';

  beforeEach(() => {
    mockRepo = makeMockRepo();
    mockS3 = makeMockS3();
  });

  it('returns steps sorted by stepIndex ascending', async () => {
    const run = makeRun();
    (mockRepo.getById as ReturnType<typeof vi.fn>).mockResolvedValue(run);
    (mockRepo.getSteps as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeStep({ stepId: 'step-3', stepIndex: 2, label: 'Third' }),
      makeStep({ stepId: 'step-1', stepIndex: 0, label: 'First' }),
      makeStep({ stepId: 'step-2', stepIndex: 1, label: 'Second' }),
    ]);

    const handler = createRunDetailHandler(mockRepo, mockS3, bucket);
    const response = await handler(makeEvent());

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.run.runId).toBe('run-1');
    expect(body.steps).toHaveLength(3);
    expect(body.steps[0].label).toBe('First');
    expect(body.steps[1].label).toBe('Second');
    expect(body.steps[2].label).toBe('Third');
  });

  it('fetches from S3 when step has outputRef', async () => {
    const run = makeRun();
    (mockRepo.getById as ReturnType<typeof vi.fn>).mockResolvedValue(run);
    (mockRepo.getSteps as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeStep({ stepId: 'step-1', stepIndex: 0, outputRef: 'artifacts/run-1/step-1.json' }),
    ]);

    const handler = createRunDetailHandler(mockRepo, mockS3, bucket);
    const response = await handler(makeEvent());

    expect(mockS3.getObjectTruncated).toHaveBeenCalledWith(
      'test-bucket',
      'artifacts/run-1/step-1.json',
      500,
    );
    const body = JSON.parse(response.body);
    expect(body.steps[0].outputSummary).toBe('{"fetched":"from-s3"}');
  });

  it('applies maskSensitiveFields to inputSummary and outputSummary', async () => {
    const run = makeRun();
    (mockRepo.getById as ReturnType<typeof vi.fn>).mockResolvedValue(run);
    (mockRepo.getSteps as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeStep({
        stepId: 'step-1',
        stepIndex: 0,
        inputSummary: '{"password":"secret123","name":"test"}',
        outputSummary: '{"token":"abc","data":"safe"}',
      }),
    ]);

    const handler = createRunDetailHandler(mockRepo, mockS3, bucket);
    const response = await handler(makeEvent());

    const body = JSON.parse(response.body);
    const step = body.steps[0];
    const input = JSON.parse(step.inputSummary);
    const output = JSON.parse(step.outputSummary);

    expect(input.password).toBe('••••••••');
    expect(input.name).toBe('test');
    expect(output.token).toBe('••••••••');
    expect(output.data).toBe('safe');
  });

  it('returns 404 when run is not found', async () => {
    (mockRepo.getById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const handler = createRunDetailHandler(mockRepo, mockS3, bucket);
    const response = await handler(makeEvent());

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.message).toBe('Run not found');
  });

  it('returns 404 when run belongs to a different tenant', async () => {
    const run = makeRun({ tenantId: 'other-tenant' });
    (mockRepo.getById as ReturnType<typeof vi.fn>).mockResolvedValue(run);

    const handler = createRunDetailHandler(mockRepo, mockS3, bucket);
    const response = await handler(makeEvent());

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.message).toBe('Run not found');
  });
});
