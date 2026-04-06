import { executeHttpAction, } from './http-action/index.js';
import oneRosterConnector from './oneroster/index.js';
import ltiProvisionConnector from './lti-provision/index.js';
const httpConnector = {
    async run(params, context) {
        return executeHttpAction(params, context, {
            secretsClient: { send: async () => ({ SecretString: '' }) },
        });
    },
};
export const connectorRegistry = {
    http: httpConnector,
    oneroster: oneRosterConnector,
    'lti-provision': ltiProvisionConnector,
};
export function resolveConnector(connectorKey) {
    if (!Object.prototype.hasOwnProperty.call(connectorRegistry, connectorKey)) {
        throw new Error(`Unknown connector key: ${connectorKey}`);
    }
    return connectorRegistry[connectorKey];
}
//# sourceMappingURL=registry.js.map