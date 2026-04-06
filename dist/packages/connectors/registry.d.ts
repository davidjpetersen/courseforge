import { type ConnectorContext } from './http-action/index.js';
export interface Connector {
    run(params: unknown, context: ConnectorContext): Promise<unknown>;
}
export declare const connectorRegistry: Record<string, Connector>;
export declare function resolveConnector(connectorKey: string): Connector;
//# sourceMappingURL=registry.d.ts.map