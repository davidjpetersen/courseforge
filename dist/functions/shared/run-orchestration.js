export async function executeRunSequentially(steps, input, executor) {
    let accumulatedContext = {
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
//# sourceMappingURL=run-orchestration.js.map