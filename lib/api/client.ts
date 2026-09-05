/**
 * HTTP client wrapper for API calls
 * Includes Request ID propagation for debugging across services
 */

import { authMessageFromStatus, AUTH_ERROR_MESSAGES, type SessionRefreshResult } from '@ciphera-net/facet'
import { generateRequestId, getRequestIdHeader, setLastRequestId } from '@/lib/utils/requestId'
import { env } from '@/lib/env'

/** Request timeout in ms; network errors surface as user-facing "Network error, please try again." */
const FETCH_TIMEOUT_MS = 30_000

// Sourced from the Zod-validated env schema in lib/env.ts. The schema
// validates URL format at module load time and throws a structured error
// listing every problem if anything is missing or malformed. No runtime
// fallbacks — this replaces the 11-04-2026 outage-causing localhost
// fallbacks and the subsequent DIY requireEnv helper with the
// industry-standard @t3-oss/env-nextjs + Zod pattern.
export const API_URL = env.NEXT_PUBLIC_API_URL
export const ID_URL = env.NEXT_PUBLIC_ID_URL
export const APP_URL = env.NEXT_PUBLIC_APP_URL
export const ID_API_URL = env.NEXT_PUBLIC_ID_API_URL

export function getLoginUrl(redirectPath = '/auth/callback') {
  const redirectUri = encodeURIComponent(`${APP_URL}${redirectPath}`)
  return `${ID_URL}/login?client_id=pulse-app&redirect_uri=${redirectUri}&response_type=code`
}

export function getSignupUrl(redirectPath = '/auth/callback') {
  const redirectUri = encodeURIComponent(`${APP_URL}${redirectPath}`)
  return `${ID_URL}/signup?client_id=pulse-app&redirect_uri=${redirectUri}&response_type=code`
}

// * ============================================================================
// * CSRF Token Handling
// * ============================================================================

/**
 * Get CSRF token from the csrf_token cookie (non-httpOnly)
 * This is needed for state-changing requests to the Auth API
 */
function getCSRFToken(): string | null {
  if (typeof document === 'undefined') return null
  
  const cookies = document.cookie.split(';')
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=')
    if (name === 'csrf_token') {
      return decodeURIComponent(value)
    }
  }
  return null
}

/**
 * Check if a request method requires CSRF protection
 * State-changing methods (POST, PUT, DELETE, PATCH) need CSRF tokens
 */
function isStateChangingMethod(method: string): boolean {
  const stateChangingMethods = ['POST', 'PUT', 'DELETE', 'PATCH']
  return stateChangingMethods.includes(method.toUpperCase())
}

export class ApiError extends Error {
  status: number
  data?: Record<string, unknown>
  
  constructor(message: string, status: number, data?: Record<string, unknown>) {
    super(message)
    this.status = status
    this.data = data
  }
}

// * ============================================================================
// * The access token, held in memory (per-app sessions S3)
// * ============================================================================
// *
// * Pulse's session cookies are host-only on pulse.ciphera.net since S3, and the
// * API lives on a different host (pulse-api.ciphera.net), so no cookie can
// * carry the credential there any more. The browser holds the 15-minute access
// * token HERE — a module variable, never localStorage, never sessionStorage —
// * and sends it as `Authorization: Bearer`. It arrives from three places, all
// * same-origin: getSessionAction() on load (from the httpOnly pulse_access
// * cookie), the /api/auth/refresh route's body on every renewal, and the OAuth
// * exchange's return. A full page load starts empty and is re-primed by the
// * auth context before any data hook can fire.
// *
// * Stated trade, accepted by the owner 05-09-2026: a script injected into this
// * origin can read this value for its 15-minute life. It cannot read the
// * refresh token (httpOnly), and it cannot reach Warden or the ceremony.
let accessToken: string | null = null

/** Called by the auth context whenever a fresh token is known; null on sign-out. */
export function setAccessToken(token: string | null): void {
  accessToken = token && token.length > 0 ? token : null
}

/** Exposed for tests and the auth context; never persist what this returns. */
export function getAccessToken(): string | null {
  return accessToken
}

// * Shared refresh handler — injected by AuthProvider via setRefreshHandler().
// * Routes all 401 refresh attempts through useSessionRefresh's mutex,
// * preventing concurrent refresh calls that trigger token reuse detection.
// *
// * 🔴 It returns the DETAILED outcome, not a boolean. The distinction is
// * load-bearing here: a `{ transient: true }` refresh (network down, 5xx,
// * timeout) means the session MAY still be valid, so this path must not wipe
// * the cached user — collapsing it into `false` and clearing local state is
// * what logged users out on a wake-time blip. Only a definitive rejection
// * clears the cache. See @ciphera-net/facet refreshDetailed and
// * Infra/Auth/docs/audits/25-08-2026-lost-rotation-reuse-revocation-and-half-state-chrome.md §3.
let refreshHandler: (() => Promise<SessionRefreshResult>) | null = null

export function setRefreshHandler(handler: (() => Promise<SessionRefreshResult>) | null) {
  refreshHandler = handler
}

// * ============================================================================
// * Request Deduplication & Caching
// * ============================================================================

/** Cache TTL in milliseconds (2 seconds) */
const CACHE_TTL_MS = 2_000

/** Stores in-flight requests for deduplication */
interface PendingRequest {
  promise: Promise<unknown>
  timestamp: number
}
const pendingRequests = new Map<string, PendingRequest>()

/** Stores cached responses */
interface CachedResponse {
  data: unknown
  timestamp: number
}
const responseCache = new Map<string, CachedResponse>()

/**
 * Generate a unique key for a request based on endpoint and options
 */
function getRequestKey(endpoint: string, options: RequestInit): string {
  const method = options.method || 'GET'
  const body = options.body || ''
  return `${method}:${endpoint}:${body}`
}

/**
 * Clean up expired entries from pending requests and response cache
 */
function cleanupExpiredEntries(): void {
  const now = Date.now()

  // * Clean up stale pending requests (older than 30 seconds)
  for (const [key, pending] of pendingRequests.entries()) {
    if (now - pending.timestamp > 30_000) {
      pendingRequests.delete(key)
    }
  }

  // * Clean up stale cached responses (older than CACHE_TTL_MS)
  for (const [key, cached] of responseCache.entries()) {
    if (now - cached.timestamp > CACHE_TTL_MS) {
      responseCache.delete(key)
    }
  }
}

/**
 * Options for apiRequest. Extends the standard RequestInit with a skip-refresh
 * flag for OPAQUE endpoints: those are unauthenticated and a 401 means bad
 * password / require_2fa, NOT an expired access token — so the auto-refresh retry
 * must be skipped, otherwise it burns the single-use OPAQUE login state on a
 * pointless retry.
 */
export interface ApiRequestOptions extends RequestInit {
  skipAuthRetry?: boolean // * Set to true to skip automatic refresh on 401
}

/**
 * Base API client with error handling, request deduplication, and short-term caching
 */
async function apiRequest<T>(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  // * Skip deduplication for non-GET requests (mutations should always execute)
  const method = options.method || 'GET'
  const shouldDedupe = method === 'GET'

  if (shouldDedupe) {
    // * Clean up expired entries periodically
    if (pendingRequests.size > 100 || responseCache.size > 100) {
      cleanupExpiredEntries()
    }

    const requestKey = getRequestKey(endpoint, options)

    // * Check if we have a recent cached response (within 2 seconds)
    const cached = responseCache.get(requestKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data as T
    }

    // * Check if there's an identical request in flight
    const pending = pendingRequests.get(requestKey)
    if (pending && Date.now() - pending.timestamp < 30000) {
      return pending.promise as Promise<T>
    }
  }

  // * Determine base URL
  const isAuthRequest = endpoint.startsWith('/auth')
  const baseUrl = isAuthRequest ? ID_API_URL : API_URL

  // * Handle legacy endpoints that already include /api/ prefix
  const url = endpoint.startsWith('/api/')
    ? `${baseUrl}${endpoint}`
    : `${baseUrl}/api/v1${endpoint}`

  // * Generate and store request ID for tracing
  const requestId = generateRequestId()
  setLastRequestId(requestId)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    [getRequestIdHeader()]: requestId,
  }
  
  // * Merge any additional headers from options
  if (options.headers) {
    const additionalHeaders = options.headers as Record<string, string>
    Object.entries(additionalHeaders).forEach(([key, value]) => {
      headers[key] = value
    })
  }

  // * The credential is the in-memory access token, sent as a Bearer (S3).
  // * pulse-backend checks the header before any cookie and skips its CSRF
  // * double-submit for a Bearer; id-backend accepts the header too. A caller
  // * that already set Authorization (the OPAQUE transports) keeps its own.
  // *
  // * `credentials: 'include'` stays for the transition: the ceremony's apex
  // * cookies still satisfy id-backend's CSRF pair on the /auth/* routes until
  // * S5 makes the ceremony host-only, and the browser still holds them.
  const bearer = getAccessToken()
  if (bearer && !headers['Authorization'] && !headers['authorization']) {
    headers['Authorization'] = `Bearer ${bearer}`
  }

  // * Add CSRF token for all state-changing requests (Pulse API and Auth API).
  // * pulse-backend ignores it on a Bearer request; id-backend still requires
  // * the apex pair until S5.
  if (isStateChangingMethod(method)) {
    const csrfToken = getCSRFToken()
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken
    }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  const signal = options.signal ?? controller.signal

  // * Create the request promise
  const requestPromise = (async (): Promise<T> => {
    let response: Response
    try {
      response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include', // * IMPORTANT: Send cookies
        signal,
      })
      clearTimeout(timeoutId)
    } catch (e) {
      clearTimeout(timeoutId)
      if (e instanceof Error && (e.name === 'AbortError' || e.name === 'TypeError')) {
        throw new ApiError(AUTH_ERROR_MESSAGES.NETWORK, 0)
      }
      throw e
    }

  if (!response.ok) {
    if (response.status === 401) {
      // * Attempt Token Refresh if 401
      if (typeof window !== 'undefined') {
        // * Skip token refresh for public endpoints (they use password auth, not session tokens)
        // * and for refresh requests themselves (prevent infinite loop). OPAQUE flows pass
        // * skipAuthRetry so a 401 never triggers a refresh that would burn single-use login state.
        if (!options.skipAuthRetry && !endpoint.includes('/auth/refresh') && !endpoint.includes('/public/') && refreshHandler) {
          const outcome = await refreshHandler()

          if (outcome.ok) {
            const retryHeaders: Record<string, string> = {
              'Content-Type': 'application/json',
              [getRequestIdHeader()]: generateRequestId(),
            }
            if (options.headers) {
              Object.entries(options.headers as Record<string, string>).forEach(([key, value]) => {
                retryHeaders[key] = value
              })
            }
            // * The renewal just primed a NEW access token; the retry must carry it.
            const renewed = getAccessToken()
            if (renewed && !retryHeaders['Authorization'] && !retryHeaders['authorization']) {
              retryHeaders['Authorization'] = `Bearer ${renewed}`
            }
            if (isStateChangingMethod(method)) {
              const csrfToken = getCSRFToken()
              if (csrfToken) retryHeaders['X-CSRF-Token'] = csrfToken
            }
            const retryResponse = await fetch(url, {
              ...options,
              headers: retryHeaders,
              credentials: 'include',
            })

            if (retryResponse.ok) {
              return retryResponse.json()
            }
            const retryBody = await retryResponse.json().catch(() => ({}))
            throw new ApiError(authMessageFromStatus(retryResponse.status), retryResponse.status, retryBody)
          }

          // 🔴 Only a DEFINITIVE rejection clears the cached user. A transient
          // * refresh failure (network down, 5xx, timeout) is not a statement
          // * that the session is dead — wiping the cache on it is what turned a
          // * wake-time blip into a durable logged-out state that the auth
          // * context could never recover from. Leave the cache intact; the
          // * data fetch still fails now, but the session can come back.
          if (!outcome.transient) {
            localStorage.removeItem('user')
            setAccessToken(null)
          }
          throw new ApiError(authMessageFromStatus(401), 401, { transient: outcome.transient })
        }
      }
    }

    const errorBody = await response.json().catch(() => ({}))

    // * Capture Retry-After header on 429 so callers can show precise timing
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After')
      if (retryAfter) {
        errorBody.retryAfter = parseInt(retryAfter, 10)
      }
    }

    const message = authMessageFromStatus(response.status)
    throw new ApiError(message, response.status, errorBody)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json()
  })()

  // * Mutations invalidate the whole GET micro-cache once they land: an SWR
  // * revalidate fired right after a POST/PATCH could otherwise be served the
  // * pre-mutation body for up to CACHE_TTL_MS (the cancel/resume subscription
  // * flows hit exactly this window). The cache is a 2s dedupe aid, not state —
  // * dropping it wholesale on the rare mutation is free.
  if (!shouldDedupe) {
    requestPromise
      .then((data) => {
        responseCache.clear()
        return data
      })
      .catch(() => {})
  }

  // * For GET requests, track the promise for deduplication and cache the result
  if (shouldDedupe) {
    const requestKey = getRequestKey(endpoint, options)

    // * Store in pending requests
    pendingRequests.set(requestKey, {
      promise: requestPromise as Promise<unknown>,
      timestamp: Date.now(),
    })

    // * Clean up pending request and cache the result when done
    requestPromise
      .then((data) => {
        // * Cache successful response
        responseCache.set(requestKey, {
          data,
          timestamp: Date.now(),
        })
        // * Remove from pending
        pendingRequests.delete(requestKey)
        return data
      })
      .catch(() => {
        // * Remove from pending on error too. Cleanup ONLY — callers hold
        // * requestPromise, not this bookkeeping chain, so re-throwing here
        // * minted a second, unawaited rejection that surfaced as a global
        // * "Uncaught (in promise)" the first time a routine GET 404'd
        // * (the page-preview absence path).
        pendingRequests.delete(requestKey)
      })
  }

  return requestPromise
}

export const authFetch = apiRequest
export default apiRequest
