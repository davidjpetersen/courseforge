/**
 * Lambda handler for the Publish API.
 *
 * POST /workflows — validates request, triggers Step Functions publish pipeline,
 * and returns the created workflow details.
 */
import type { Workflow } from '../../models/types.js';
export interface PublishRequest {
    templateId: string;
    tenantId: string;
    name: string;
    configuration: Record<string, unknown>;
}
export interface PublishResponse {
    workflowId: string;
    status: 'active';
    name: string;
    firstRunUrl: string;
}
export interface StepFunctionsClient {
    /**
     * Start the publish pipeline state machine.
     * Returns the created Workflow record on success.
     */
    startPublishPipeline(request: PublishRequest): Promise<Workflow>;
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
export declare function validatePublishRequest(body: unknown): PublishRequest | string;
export declare function buildFirstRunUrl(workflowId: string, tenantId: string): string;
export declare function createPublishHandler(sfnClient: StepFunctionsClient): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
//# sourceMappingURL=handler.d.ts.map