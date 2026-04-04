export class CompilationError extends Error {
    field;
    constructor(field, message) {
        super(message);
        this.name = 'CompilationError';
        this.field = field;
    }
}
function renderTemplate(value, params, fieldPath) {
    return value.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, key) => {
        const paramValue = params[key];
        if (paramValue === undefined || paramValue === null || paramValue === '') {
            throw new CompilationError(key, `${fieldPath} references missing param '${key}'`);
        }
        return String(paramValue);
    });
}
function deepResolve(value, params, connectionsById, fieldPath) {
    if (typeof value === 'string') {
        return renderTemplate(value, params, fieldPath);
    }
    if (Array.isArray(value)) {
        return value.map((entry, index) => deepResolve(entry, params, connectionsById, `${fieldPath}[${index}]`));
    }
    if (typeof value !== 'object' || value === null) {
        return value;
    }
    const record = value;
    if (typeof record.connectionKey === 'string') {
        const connection = connectionsById.get(record.connectionKey);
        if (!connection) {
            throw new CompilationError('connectionKey', `Unknown connectionKey '${record.connectionKey}'`);
        }
        return {
            ...record,
            secretRef: connection.secretRef,
        };
    }
    const resolved = {};
    Object.entries(record).forEach(([key, nested]) => {
        resolved[key] = deepResolve(nested, params, connectionsById, `${fieldPath}.${key}`);
    });
    return resolved;
}
export function compilePlan(recipe, params, connections) {
    const connectionMap = new Map(connections.map((connection) => [connection.connectionId, connection]));
    return recipe.steps.map((step) => {
        for (const requiredParam of step.requiredParams ?? []) {
            const value = params[requiredParam];
            if (value === undefined || value === null || value === '') {
                throw new CompilationError(requiredParam, `Missing required param '${requiredParam}'`);
            }
        }
        const mergedParams = {
            ...step.params,
            ...params,
        };
        const resolved = deepResolve(mergedParams, params, connectionMap, step.name);
        return {
            stepId: step.stepId,
            name: step.name,
            type: step.type,
            params: resolved,
        };
    });
}
//# sourceMappingURL=compile-plan.js.map