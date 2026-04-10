/**
 * Publish UI — View models for publish confirmation and error handling.
 *
 * Pure TypeScript functions (no React, no DOM).
 */

import type { PublishRequest, PublishResponse } from '../api/publish/handler';

// ── 10.3 PublishConfirmation View Model ──

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
export function buildPublishConfirmationViewModel(
  response: PublishResponse,
  request: PublishRequest,
): PublishConfirmationViewModel {
  return {
    workflowId: response.workflowId,
    workflowName: response.name,
    status: response.status,
    monitoringLink: response.firstRunUrl,
    templateId: request.templateId,
    tenantId: request.tenantId,
  };
}

// ── 10.4 Publish Error Handling ──

export interface PublishErrorViewModel {
  hasError: boolean;
  errorMessage: string | null;
  errorDetails: string | null;
  canRetry: boolean;
}

/** Error types that should not allow retry (e.g., validation failures). */
const NON_RETRYABLE_PATTERNS = [
  'validation',
  'invalid',
  'missing required',
  'malformed',
] as const;

/**
 * Builds an error view model from a caught publish error.
 * Preserves wizard state for retry by signaling `canRetry`.
 */
export function buildPublishErrorViewModel(
  error: unknown,
): PublishErrorViewModel {
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
export function buildNoErrorViewModel(): PublishErrorViewModel {
  return {
    hasError: false,
    errorMessage: null,
    errorDetails: null,
    canRetry: false,
  };
}

// ── Helpers ──

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>;
    if (typeof obj.message === 'string') return obj.message;
  }
  return 'An unexpected error occurred during publish';
}

function extractErrorDetails(error: unknown): string | null {
  if (error instanceof Error && error.stack) {
    return error.stack;
  }
  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>;
    if (typeof obj.details === 'string') return obj.details;
  }
  return null;
}

function isNonRetryableError(message: string): boolean {
  const lower = message.toLowerCase();
  return NON_RETRYABLE_PATTERNS.some((pattern) => lower.includes(pattern));
}
