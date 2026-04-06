import type { ExecuteStepInput, ExecuteStepOutput, StepDefinition } from './types.js';
export interface StepExecutor {
    execute(input: ExecuteStepInput): Promise<ExecuteStepOutput>;
}
export declare function executeRunSequentially(steps: StepDefinition[], input: Omit<ExecuteStepInput, 'step' | 'accumulatedContext'> & {
    payload: Record<string, unknown>;
}, executor: StepExecutor): Promise<Record<string, unknown>>;
//# sourceMappingURL=run-orchestration.d.ts.map