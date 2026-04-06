import type { ExecuteStepInput, ExecuteStepOutput, StepDefinition } from './types.js';

export interface StepExecutor {
  execute(input: ExecuteStepInput): Promise<ExecuteStepOutput>;
}

export async function executeRunSequentially(
  steps: StepDefinition[],
  input: Omit<ExecuteStepInput, 'step' | 'accumulatedContext'> & { payload: Record<string, unknown> },
  executor: StepExecutor,
): Promise<Record<string, unknown>> {
  let accumulatedContext: Record<string, unknown> = {
    ...input.payload,
    tenantId: input.tenantId,
    traceId: input.traceId,
  };

  for (const step of steps) {
    const result = await executor.execute({
      step,
      runId: input.runId,
      tenantId: input.tenantId,
      traceId: input.traceId,
      accumulatedContext,
    });
    accumulatedContext = result.accumulatedContext;
  }

  return accumulatedContext;
}
