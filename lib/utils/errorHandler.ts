/**
 * Error handling utilities with Request ID extraction
 * Helps users report errors with traceable IDs for support
 */

import { getLastRequestId } from './requestId'

interface ApiErrorResponse {
  error?: {
    code?: string
    message?: string
    details?: unknown
    request_id?: string
  }
}

/**
 * Extract request ID from error response or use last known request ID
 */
export function getRequestIdFromError(errorData?: ApiErrorResponse): string | null {
  // * Try to get from error response body
  if (errorData?.error?.request_id) {
    return errorData.error.request_id
  }

  // * Fallback to last request ID stored during API call
  return getLastRequestId()
}

/**
 * Format error message for display with optional request ID
 * Shows request ID in development or for specific error types
 */
export function formatErrorMessage(
  message: string,
  errorData?: ApiErrorResponse,
  options: { showRequestId?: boolean } = {}
): string {
  const requestId = getRequestIdFromError(errorData)

  // * Always show request ID in development
  const isDev = process.env.NODE_ENV === 'development'

  if (requestId && (isDev || options.showRequestId)) {
    return `${message}\n\nRequest ID: ${requestId}`
  }

  return message
}

/**
 * Log error with request ID for debugging
 */
export function logErrorWithRequestId(
  context: string,
  error: unknown,
  errorData?: ApiErrorResponse
): void {
  const requestId = getRequestIdFromError(errorData)

  if (requestId) {
    console.error(`[${context}] Request ID: ${requestId}`, error)
  } else {
    console.error(`[${context}]`, error)
  }
}

/**
 * Get support message with request ID for user reports
 */
export function getSupportMessage(errorData?: ApiErrorResponse): string {
  const requestId = getRequestIdFromError(errorData)

  if (requestId) {
    return `If this persists, contact support with Request ID: ${requestId}`
  }

  return 'If this persists, please contact support.'
}
