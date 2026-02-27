/**
 * Request ID utilities for tracing API calls across services
 * Request IDs help debug issues by correlating logs across frontend and backends
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
 * Store the last request ID for error reporting
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
