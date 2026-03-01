/**
 * Request ID utilities for tracing API calls across services
 * Request IDs help debug issues by correlating logs across frontend and backends
 *
 * IMPORTANT: This module stores mutable state (lastRequestId) at module scope.
 * This is safe because apiRequest (the only caller) runs exclusively in the
 * browser where JS is single-threaded. If this ever needs server-side use,
 * replace the module variable with AsyncLocalStorage.
 */

const REQUEST_ID_HEADER = 'X-Request-ID'

/**
 * Generate a unique request ID
 * Format: REQ<timestamp>_<random>
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return `REQ${timestamp}_${random}`
}

/**
 * Get request ID header name
 */
export function getRequestIdHeader(): string {
  return REQUEST_ID_HEADER
}

/**
 * Store the last request ID for error reporting.
 * Browser-only — single-threaded, no concurrency risk.
 */
let lastRequestId: string | null = null

export function setLastRequestId(id: string): void {
  lastRequestId = id
}

export function getLastRequestId(): string | null {
  return lastRequestId
}

/**
 * Clear the stored request ID
 */
export function clearLastRequestId(): void {
  lastRequestId = null
}
