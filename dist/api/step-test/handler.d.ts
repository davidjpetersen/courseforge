/**
 * Lambda handler for the Step Test API.
 *
 * POST /steps/{stepId}/test — dry-run validation against connected system.
 */
import type { FieldValue } from '../../models/types.js';
export interface StepTestRequest {
    templateId: string;
    stepIndex: number;
    configuration: Record<string, FieldValue>;
}
export interface StepTestResponse {
    result: 'pass' | 'fail';
    details: string;
    suggestedFix: string | null;
}
export interface ConnectedSystemClient {
    /** Execute a dry-run validation of the step configuration. */
    dryRun(systemName: string, configuration: Record<string, FieldValue>): Promise<StepTestResponse>;
}
export interface StepTestTemplateProvider {
    /** Return the connected system name for a given template step, or null. */
    getConnectedSystemForStep(templateId: string, stepIndex: number): Promise<string | null>;
}
export interface APIGatewayProxyEvent {
    httpMethod: string;
    path: string;
    pathParameters?: Record<string, string> | null;
    queryStringParameters?: Record<string, string> | null;
    headers?: Record<string, string> | null;
    body?: string | null;
}
export interface APIGatewayProxyResult {
    statusCode: number;
    headers?: Record<string, string>;
    body: string;
}
export declare function validateStepTestRequest(body: unknown): StepTestRequest | string;
export declare function createStepTestHandler(templateProvider: StepTestTemplateProvider, systemClient: ConnectedSystemClient): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
//# sourceMappingURL=handler.d.ts.map