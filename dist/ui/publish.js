/**
 * Publish UI — View models for publish confirmation and error handling.
 *
 * Pure TypeScript functions (no React, no DOM).
 */
/**
 * Builds a confirmation view model from a successful publish response
 * and the original request.
 */
export function buildPublishConfirmationViewModel(response, request) {
    return {
        workflowId: response.workflowId,
        workflowName: response.name,
        status: response.status,
        monitoringLink: response.firstRunUrl,
        templateId: request.templateId,
        tenantId: request.tenantId,
    };
}
/** Error types that should not allow retry (e.g., validation failures). */
const NON_RETRYABLE_PATTERNS = [
    'validation',
    'invalid',
    'missing required',
    'malformed',
];
/**
 * Builds an error view model from a caught publish error.
 * Preserves wizard state for retry by signaling `canRetry`.
 */
export function buildPublishErrorViewModel(error) {
    if (error === null || error === undefined) {
        return {
            hasError: false,
            errorMessage: null,
            errorDetails: null,
            canRetry: false,
        };
    }
    const message = extractErrorMessage(error);
    const details = extractErrorDetails(error);
    const canRetry = !isNonRetryableError(message);
    return {
        hasError: true,
        errorMessage: message,
        errorDetails: details,
        canRetry,
    };
}
/**
 * Builds a "no error" view model (for initial/success state).
 */
export function buildNoErrorViewModel() {
    return {
        hasError: false,
        errorMessage: null,
        errorDetails: null,
        canRetry: false,
    };
}
// ── Helpers ──
function extractErrorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    if (typeof error === 'object' && error !== null) {
        const obj = error;
        if (typeof obj.message === 'string')
            return obj.message;
    }
    return 'An unexpected error occurred during publish';
}
function extractErrorDetails(error) {
    if (error instanceof Error && error.stack) {
        return error.stack;
    }
    if (typeof error === 'object' && error !== null) {
        const obj = error;
        if (typeof obj.details === 'string')
            return obj.details;
    }
    return null;
}
function isNonRetryableError(message) {
    const lower = message.toLowerCase();
    return NON_RETRYABLE_PATTERNS.some((pattern) => lower.includes(pattern));
}
//# sourceMappingURL=publish.js.map