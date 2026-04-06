import {
  executeHttpAction,
  type ConnectorContext,
  type HttpActionParams,
} from './http-action/index.js';
import oneRosterConnector from './oneroster/index.js';
import ltiProvisionConnector from './lti-provision/index.js';

export interface Connector {
  run(params: unknown, context: ConnectorContext): Promise<unknown>;
}

const httpConnector: Connector = {
  async run(params: unknown, context: ConnectorContext): Promise<unknown> {
    return executeHttpAction(params as HttpActionParams, context, {
      secretsClient: { send: async () => ({ SecretString: '' }) },
    });
  },
};

export const connectorRegistry: Record<string, Connector> = {
  http: httpConnector,
  oneroster: oneRosterConnector as unknown as Connector,
  'lti-provision': ltiProvisionConnector as unknown as Connector,
};

export function resolveConnector(connectorKey: string): Connector {
  if (!Object.prototype.hasOwnProperty.call(connectorRegistry, connectorKey)) {
    throw new Error(`Unknown connector key: ${connectorKey}`);
  }

  return connectorRegistry[connectorKey];
}
