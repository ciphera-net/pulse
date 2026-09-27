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

// * ============================================================================
// * The active team (Phase 2, PULSE-89), held in memory like the access token
// * ============================================================================
// *
// * Which team pulse-api answers a request for, sent as `X-Pulse-Team`. Never
// * persisted by this module — same rule as the access token above. The
// * durable copy is the `pulse_team` cookie (lib/auth/session-cookies.ts), a
// * PREFERENCE that survives a reload; this is what a running tab actually
// * sends. AuthProvider sets it from Pulse's own /me at init and after every
// * switch (lib/auth/switchOrganization.ts's activateTeam).
let activeTeam: string | null = null

/** Called by the auth context whenever the active team is known; null for none. */
export function setActiveTeam(id: string | null): void {
  activeTeam = id && id.length > 0 ? id : null
}

/** Exposed for tests and the auth context; never persist what this returns. */
export function getActiveTeam(): string | null {
  return activeTeam
}

// * ============================================================================
// * Team recovery (Phase 2, PULSE-89)
// * ============================================================================
// *
// * pulse-api answers 403 { error, code } when a request's X-Pulse-Team names
// * a team the caller cannot use any more — missing header, not a member, or
// * the team was deleted. None of that is retryable on the SAME request (the
// * team named in the header is simply wrong), so the handler re-resolves the
// * active team for the NEXT one, fire-and-forget: it never blocks or changes
// * the outcome of the request that found the problem.
const TEAM_ERROR_CODES = new Set(['TEAM_REQUIRED', 'NOT_A_MEMBER', 'TEAM_DELETED'])
const TEAM_RECOVERY_THROTTLE_MS = 10_000

let teamRecoveryHandler: (() => Promise<void>) | null = null
let teamRecoveryInFlight: Promise<void> | null = null
let teamRecoveryLastRunAt = 0

/** Injected by the auth context; null on sign-out. */
export function setTeamRecoveryHandler(handler: (() => Promise<void>) | null): void {
  teamRecoveryHandler = handler
}

/** Single-flight and throttled to at most once per 10s — see the block comment above. */
function maybeRecoverTeam(): void {
  if (!teamRecoveryHandler || teamRecoveryInFlight) return
  const now = Date.now()
  if (now - teamRecoveryLastRunAt < TEAM_RECOVERY_THROTTLE_MS) return
  teamRecoveryLastRunAt = now
  const handler = teamRecoveryHandler
  teamRecoveryInFlight = handler()
    .catch(() => {
      // * Best-effort. A failed recovery leaves the active team as it was; the
      // * next team-shaped 403 tries again once the throttle window passes.
    })
    .finally(() => { teamRecoveryInFlight = null })
}

/** Fires team recovery when `body` is a team-shaped 403; never for `/auth/*`, which has no team at all. */
function maybeTriggerTeamRecovery(isAuthRequest: boolean, status: number, body: Record<string, unknown> | undefined): void {
  if (isAuthRequest || status !== 403) return
  const code = typeof body?.code === 'string' ? body.code : null
  if (code && TEAM_ERROR_CODES.has(code)) maybeRecoverTeam()
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
 *
 * 🔴 INCLUDES THE ACTIVE TEAM (Phase 2, PULSE-89) for anything that is not an
 * `/auth/*` request. X-Pulse-Team is now silently part of every pulse-api
 * request (see buildSessionHeaders below), so it must be part of the cache
 * key too — otherwise a team switch could be served the PREVIOUS team's GET
 * for up to CACHE_TTL_MS out of the 2s micro-cache, or dedupe against an
 * identical in-flight request that was actually answering for the old team.
 */
function getRequestKey(endpoint: string, options: RequestInit): string {
  const method = options.method || 'GET'
  const body = options.body || ''
  const team = endpoint.startsWith('/auth') ? '' : getActiveTeam() ?? ''
  return `${method}:${endpoint}:${body}:${team}`
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
 * Every header a session-authenticated request needs, layered onto whatever
 * the caller already set — the ONE place this is assembled, used by
 * `apiRequest`'s first attempt, its 401 refresh-and-retry, and
 * `apiRequestBlob` (previously three hand-written copies that could each
 * drift on their own).
 *
 * * `Authorization: Bearer` — the in-memory access token, unless the caller
 *   already set one (the OPAQUE transports pass their own).
 * * `X-CSRF-Token` on state-changing methods.
 * * `X-Pulse-Team` (Phase 2, PULSE-89) — the active team, ONLY for pulse-api
 *   requests. Never for `/auth/*`: id-backend's CORS does not allow this
 *   header, and sending it there would fail the preflight and break every ID
 *   call. Only when a team is actually active, and never overriding a
 *   caller-supplied `X-Pulse-Team`.
 */
function buildSessionHeaders(
  endpoint: string,
  method: string,
  base: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = { ...base }

  const bearer = getAccessToken()
  if (bearer && !headers['Authorization'] && !headers['authorization']) {
    headers['Authorization'] = `Bearer ${bearer}`
  }

  if (isStateChangingMethod(method)) {
    const csrfToken = getCSRFToken()
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken
  }

  if (!endpoint.startsWith('/auth')) {
    const team = getActiveTeam()
    if (team && !headers['X-Pulse-Team'] && !headers['x-pulse-team']) {
      headers['X-Pulse-Team'] = team
    }
  }

  return headers
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

  const baseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    [getRequestIdHeader()]: requestId,
  }

  // * Merge any additional headers from options
  if (options.headers) {
    const additionalHeaders = options.headers as Record<string, string>
    Object.entries(additionalHeaders).forEach(([key, value]) => {
      baseHeaders[key] = value
    })
  }

  // * Authorization, X-CSRF-Token, X-Pulse-Team — see buildSessionHeaders.
  // * `credentials: 'include'` stays for the transition: the ceremony's apex
  // * cookies still satisfy id-backend's CSRF pair on the /auth/* routes until
  // * S5 makes the ceremony host-only, and the browser still holds them.
  const headers = buildSessionHeaders(endpoint, method, baseHeaders)

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
            // * The renewal just primed a NEW access token; buildSessionHeaders
            // * reads getAccessToken() fresh, so the retry carries it automatically.
            const retryBase: Record<string, string> = {
              'Content-Type': 'application/json',
              [getRequestIdHeader()]: generateRequestId(),
            }
            if (options.headers) {
              Object.entries(options.headers as Record<string, string>).forEach(([key, value]) => {
                retryBase[key] = value
              })
            }
            const retryHeaders = buildSessionHeaders(endpoint, method, retryBase)
            const retryResponse = await fetch(url, {
              ...options,
              headers: retryHeaders,
              credentials: 'include',
            })

            if (retryResponse.ok) {
              return retryResponse.json()
            }
            const retryBody = await retryResponse.json().catch(() => ({}))
            maybeTriggerTeamRecovery(isAuthRequest, retryResponse.status, retryBody)
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

    // * A team-shaped 403 (Phase 2, PULSE-89) triggers recovery for the NEXT
    // * request; this one still fails exactly as before.
    maybeTriggerTeamRecovery(isAuthRequest, response.status, errorBody)

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

/**
 * A binary download that carries the session, for endpoints that answer with a
 * file rather than JSON.
 *
 * 🔴 THIS EXISTS BECAUSE `fetch(url, { credentials: 'include' })` IS NOT
 * AUTHENTICATED ANY MORE. Since per-app sessions (S3) the credential is the
 * in-memory access token sent as a Bearer, and Pulse's cookies are host-only on
 * the app's own origin — so a hand-rolled fetch to pulse-api carries nothing the
 * API will accept. `downloadInvoicePDF` was written in April, when a cookie did
 * authenticate it, and returned 401 from the migration (05-09-2026) until this
 * was added on 14-09.
 *
 * It deliberately shares `apiRequest`'s rules — same base-URL resolution, same
 * Bearer, same ONE refresh-and-retry on a 401 — because a second, subtly
 * different auth path is how the first one rots. What it does NOT share is the
 * GET dedupe/cache (a download must always execute) and the JSON parse.
 *
 * The filename comes from the server's `Content-Disposition`, which it can only
 * read because the API sets `Access-Control-Expose-Headers` for it — the API is
 * a different origin, so without that the header is invisible here.
 */
export async function apiRequestBlob(
  endpoint: string,
  options: ApiRequestOptions = {},
): Promise<{ blob: Blob; filename: string | null }> {
  const isAuthRequest = endpoint.startsWith('/auth')
  const baseUrl = isAuthRequest ? ID_API_URL : API_URL
  const url = endpoint.startsWith('/api/') ? `${baseUrl}${endpoint}` : `${baseUrl}/api/v1${endpoint}`
  const method = options.method || 'GET'

  const send = () => {
    // No Content-Type: this is a GET for bytes, and declaring JSON on it is a lie.
    const base: Record<string, string> = { [getRequestIdHeader()]: generateRequestId() }
    if (options.headers) {
      Object.entries(options.headers as Record<string, string>).forEach(([k, v]) => { base[k] = v })
    }
    // * buildSessionHeaders reads getAccessToken() itself, so the SECOND call
    // * (after a refresh) picks up the renewed token automatically.
    const headers = buildSessionHeaders(endpoint, method, base)
    return fetch(url, { ...options, headers, credentials: 'include' })
  }

  let response: Response
  try {
    response = await send()
  } catch {
    throw new ApiError(AUTH_ERROR_MESSAGES.NETWORK, 0)
  }

  if (response.status === 401 && typeof window !== 'undefined' && !options.skipAuthRetry && refreshHandler) {
    const outcome = await refreshHandler()
    if (outcome.ok) {
      try {
        response = await send()
      } catch {
        throw new ApiError(AUTH_ERROR_MESSAGES.NETWORK, 0)
      }
    }
  }

  if (!response.ok) {
    // The body is a file on success and JSON on failure — read the error, but
    // never let a non-JSON body turn a clean 4xx into a parse exception.
    const data = await response.json().catch(() => ({}))
    maybeTriggerTeamRecovery(isAuthRequest, response.status, data)
    const message = typeof data?.error === 'string' ? data.error : `Request failed (${response.status})`
    throw new ApiError(message, response.status, data)
  }

  const disposition = response.headers.get('Content-Disposition')
  const match = disposition?.match(/filename="?([^";]+)"?/i)
  return { blob: await response.blob(), filename: match?.[1] ?? null }
}

export const authFetch = apiRequest
export default apiRequest
