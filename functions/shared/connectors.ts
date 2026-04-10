import {
  executeHttpAction,
  type HttpActionParams,
  type ConnectorContext,
} from '../../packages/connectors/http-action/index';

export interface RuntimeConnector {
  run(params: Record<string, unknown>, context: Record<string, unknown>): Promise<unknown>;
}

function toConnectorContext(context: Record<string, unknown>): ConnectorContext {
  const variables = Object.fromEntries(
    Object.entries(context).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]),
  );

  return {
    variables,
    workflowId: typeof context.workflowId === 'string' ? context.workflowId : '',
    tenantId: typeof context.tenantId === 'string' ? context.tenantId : '',
    traceId: typeof context.traceId === 'string' ? context.traceId : '',
  };
}

export const runtimeConnectorRegistry = new Map<string, RuntimeConnector>([
  [
    'generic-http',
    {
      run: async (params, context) =>
        executeHttpAction(params as unknown as HttpActionParams, toConnectorContext(context), {
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
