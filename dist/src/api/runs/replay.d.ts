export interface ReplayRequest {
    pathParameters?: Record<string, string> | null;
}
export interface ReplayResponse {
    statusCode: number;
    headers?: Record<string, string>;
    body: string;
}
export interface ReplayDeps {
    getRun(runId: string): Promise<Record<string, unknown> | undefined>;
    createRun(item: Record<string, unknown>): Promise<void>;
    eventBridgeClient: {
        putEvents(params: {
            Entries: Array<{
                EventBusName: string;
                Source: string;
                DetailType: string;
                Detail: string;
            }>;
        }): Promise<unknown>;
    };
    eventBusName: string;
    clock?: () => Date;
    uuid?: () => string;
}
export declare function createReplayRunHandler(deps: ReplayDeps): (request: ReplayRequest) => Promise<ReplayResponse>;
//# sourceMappingURL=replay.d.ts.map