import { executeHttpAction, } from '../../packages/connectors/http-action/index.js';
function toConnectorContext(context) {
    const variables = Object.fromEntries(Object.entries(context).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]));
    return {
        variables,
        workflowId: typeof context.workflowId === 'string' ? context.workflowId : '',
        tenantId: typeof context.tenantId === 'string' ? context.tenantId : '',
        traceId: typeof context.traceId === 'string' ? context.traceId : '',
    };
}
export const runtimeConnectorRegistry = new Map([
    [
        'generic-http',
        {
            run: async (params, context) => executeHttpAction(params, toConnectorContext(context), {
                secretsClient: {
                    send: async () => ({ SecretString: '' }),
                },
            }),
        },
    ],
    [
        'echo',
        {
            run: async (params) => params,
        },
    ],
]);
//# sourceMappingURL=connectors.js.map