export interface RuntimeConnector {
    run(params: Record<string, unknown>, context: Record<string, unknown>): Promise<unknown>;
}
export declare const runtimeConnectorRegistry: Map<string, RuntimeConnector>;
//# sourceMappingURL=connectors.d.ts.map