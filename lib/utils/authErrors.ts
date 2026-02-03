/**
 * Auth error message mapping for user-facing copy.
 * Maps status codes and error types to safe, actionable messages (no sensitive details).
 */

export const AUTH_ERROR_MESSAGES = {
  /** Shown when session/token is expired; prompts re-login. */
  SESSION_EXPIRED: 'Session expired, please sign in again.',
  /** Shown when credentials are invalid (e.g. wrong password, invalid token). */
  INVALID_CREDENTIALS: 'Invalid credentials',
  /** Shown on network failure or timeout; prompts retry. */
  NETWORK: 'Network error, please try again.',
  /** Generic fallback for server/unknown errors. */
  GENERIC: 'Something went wrong, please try again.',
} as const

/**
 * Returns the user-facing message for a given HTTP status from an API/auth response.
 * Used when building ApiError messages and when mapping server-returned error types.
 */
export function authMessageFromStatus(status: number): string {
  if (status === 401) return AUTH_ERROR_MESSAGES.SESSION_EXPIRED
  if (status === 403) return AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS
  if (status >= 500) return AUTH_ERROR_MESSAGES.GENERIC
  return AUTH_ERROR_MESSAGES.GENERIC
}

/** Error type returned by auth server actions for mapping to user-facing copy. */
export type AuthErrorType = 'network' | 'expired' | 'invalid' | 'server'

/**
 * Maps server-action error type (e.g. from exchangeAuthCode) to user-facing message.
 * Used in auth callback so no sensitive details are shown.
 */
export function authMessageFromErrorType(type: AuthErrorType): string {
  switch (type) {
    case 'expired':
      return AUTH_ERROR_MESSAGES.SESSION_EXPIRED
    case 'invalid':
      return AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS
    case 'network':
      return AUTH_ERROR_MESSAGES.NETWORK
    case 'server':
    default:
      return AUTH_ERROR_MESSAGES.GENERIC
  }
}

/**
 * Maps an error (e.g. ApiError, network/abort) to a safe user-facing message.
 * Use this when displaying API/auth errors in the UI so expired, invalid, and network
 * cases show the correct copy without exposing sensitive details.
 */
export function getAuthErrorMessage(error: unknown): string {
  if (!error) return AUTH_ERROR_MESSAGES.GENERIC
  const err = error as { status?: number; name?: string; message?: string }
  if (typeof err.status === 'number') return authMessageFromStatus(err.status)
  if (err.name === 'AbortError') return AUTH_ERROR_MESSAGES.NETWORK
  if (err instanceof Error && (err.name === 'TypeError' || /fetch|network|failed to fetch/i.test(err.message || ''))) {
    return AUTH_ERROR_MESSAGES.NETWORK
  }
  return AUTH_ERROR_MESSAGES.GENERIC
}
