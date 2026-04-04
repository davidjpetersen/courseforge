import { executeHttpAction, } from './http-action/index.js';
const httpConnector = {
    async run(params, context) {
        return executeHttpAction(params, context, {
            secretsClient: { send: async () => ({ SecretString: '' }) },
        });
    },
};
export const connectorRegistry = {
    http: httpConnector,
};
export function resolveConnector(connectorKey) {
    const connector = connectorRegistry[connectorKey];
    if (!connector) {
        throw new Error(`Unknown connector key: ${connectorKey}`);
    }
    return connector;
}
//# sourceMappingURL=registry.js.map