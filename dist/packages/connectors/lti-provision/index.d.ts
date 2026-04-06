export interface JSONSchema7 {
    type?: string;
    properties?: Record<string, JSONSchema7>;
    required?: string[];
    enum?: string[];
    additionalProperties?: boolean;
}
export interface ConnectorContext {
    tenantId: string;
    runId: string;
}
export interface ConnectorDefinition<TParams = unknown, TResult = unknown> {
    key: string;
    displayName: string;
    authType: 'oauth2' | 'apikey' | 'basic';
    credentialSchema: JSONSchema7;
    testFn: (credentials: Record<string, unknown>) => Promise<boolean>;
    run: (params: TParams, context: ConnectorContext) => Promise<TResult>;
}
export interface LtiProvisionParams {
    lmsType: 'canvas' | 'blackboard' | 'brightspace';
    courseId: string;
    toolClientId: string;
    deploymentId?: string;
    toolName: string;
    launchUrl: string;
    customParams?: Record<string, string>;
    baseUrl?: string;
    apiKey?: string;
}
export interface LtiProvisionResult {
    success: boolean;
    deploymentId: string;
    registrationId?: string;
    launchUrl: string;
    lmsToolId: string;
    message: string;
}
export interface LtiError {
    lmsErrorCode: string;
    message: string;
    field?: string;
}
export declare function parseLmsError(response: Response, lmsType: string): Promise<LtiError>;
export declare function createD2LSignature(apiKey: string, secret: string, path: string): string;
export declare const ltiProvisionConnector: ConnectorDefinition<LtiProvisionParams, LtiProvisionResult>;
export default ltiProvisionConnector;
//# sourceMappingURL=index.d.ts.map