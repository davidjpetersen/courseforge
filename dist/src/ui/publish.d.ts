/**
 * Publish UI — View models for publish confirmation and error handling.
 *
 * Pure TypeScript functions (no React, no DOM).
 */
import type { PublishRequest, PublishResponse } from '../api/publish/handler.js';
export interface PublishConfirmationViewModel {
    workflowId: string;
    workflowName: string;
    status: string;
    monitoringLink: string;
    templateId: string;
    tenantId: string;
}
/**
 * Builds a confirmation view model from a successful publish response
 * and the original request.
 */
export declare function buildPublishConfirmationViewModel(response: PublishResponse, request: PublishRequest): PublishConfirmationViewModel;
export interface PublishErrorViewModel {
    hasError: boolean;
    errorMessage: string | null;
    errorDetails: string | null;
    canRetry: boolean;
}
/**
 * Builds an error view model from a caught publish error.
 * Preserves wizard state for retry by signaling `canRetry`.
 */
export declare function buildPublishErrorViewModel(error: unknown): PublishErrorViewModel;
/**
 * Builds a "no error" view model (for initial/success state).
 */
export declare function buildNoErrorViewModel(): PublishErrorViewModel;
//# sourceMappingURL=publish.d.ts.map