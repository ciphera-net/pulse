/**
 * HTTP client wrapper for API calls
 */

import { authMessageFromStatus, AUTH_ERROR_MESSAGES } from '@ciphera-net/ui'

/** Request timeout in ms; network errors surface as user-facing "Network error, please try again." */
const FETCH_TIMEOUT_MS = 30_000

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8082'
export const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL || 'http://localhost:3000'
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3003'
export const AUTH_API_URL = process.env.NEXT_PUBLIC_AUTH_API_URL || 'https://auth-api.ciphera.net'

export function getLoginUrl(redirectPath = '/auth/callback') {
  const redirectUri = encodeURIComponent(`${APP_URL}${redirectPath}`)
  return `${AUTH_URL}/login?client_id=pulse-app&redirect_uri=${redirectUri}&response_type=code`
}

export function getSignupUrl(redirectPath = '/auth/callback') {
  const redirectUri = encodeURIComponent(`${APP_URL}${redirectPath}`)
  return `${AUTH_URL}/signup?client_id=pulse-app&redirect_uri=${redirectUri}&response_type=code`
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

// * Mutex for token refresh
let isRefreshing = false
type RefreshSubscriber = { onSuccess: () => void; onFailure: (err: unknown) => void }
let refreshSubscribers: RefreshSubscriber[] = []

function subscribeToTokenRefresh(onSuccess: () => void, onFailure: (err: unknown) => void) {
  refreshSubscribers.push({ onSuccess, onFailure })
}

function onRefreshed() {
  refreshSubscribers.forEach((s) => s.onSuccess())
  refreshSubscribers = []
}

function onRefreshFailed(err: unknown) {
  refreshSubscribers.forEach((s) => {
    try {
      s.onFailure(err)
    } catch {
      // ignore
    }
  })
  refreshSubscribers = []
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
 * Base API client with error handling, request deduplication, and short-term caching
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
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
  const baseUrl = isAuthRequest ? AUTH_API_URL : API_URL

  // * Handle legacy endpoints that already include /api/ prefix
  const url = endpoint.startsWith('/api/')
    ? `${baseUrl}${endpoint}`
    : `${baseUrl}/api/v1${endpoint}`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  
  // * Merge any additional headers from options
  if (options.headers) {
    const additionalHeaders = options.headers as Record<string, string>
    Object.entries(additionalHeaders).forEach(([key, value]) => {
      headers[key] = value
    })
  }

  // * We rely on HttpOnly cookies, so no manual Authorization header injection.
  // * We MUST set credentials: 'include' for the browser to send cookies cross-origin (or same-site).
  
  // * Add CSRF token for state-changing requests to Auth API
  // * Auth API uses Double Submit Cookie pattern for CSRF protection
  if (isAuthRequest && isStateChangingMethod(method)) {
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
        // * Prevent infinite loop: Don't refresh if the failed request WAS a refresh request (unlikely via apiRequest but safe to check)
        if (!endpoint.includes('/auth/refresh')) {
          if (isRefreshing) {
            // * If refresh is already in progress, wait for it to complete (or fail)
            return new Promise<T>((resolve, reject) => {
              subscribeToTokenRefresh(
                async () => {
                  try {
                    const retryResponse = await fetch(url, {
                      ...options,
                      headers,
                      credentials: 'include',
                    })
                    if (retryResponse.ok) {
                      resolve(await retryResponse.json())
                    } else {
                      reject(new ApiError(authMessageFromStatus(retryResponse.status), retryResponse.status))
                    }
                  } catch (e) {
                    reject(e)
                  }
                },
                (err) => reject(err)
              )
            })
          }

          isRefreshing = true

          try {
            // * Call our Next.js API route to handle refresh securely
            const refreshRes = await fetch('/api/auth/refresh', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
            })

            if (refreshRes.ok) {
              // * Refresh successful, cookies updated
              onRefreshed()

              // * Retry original request
              const retryResponse = await fetch(url, {
                ...options,
                headers,
                credentials: 'include',
              })
              
              if (retryResponse.ok) {
                return retryResponse.json()
              }
            } else {
              const sessionExpiredMsg = authMessageFromStatus(401)
              onRefreshFailed(new ApiError(sessionExpiredMsg, 401))
              localStorage.removeItem('user')
            }
          } catch (e) {
            const err = e instanceof Error && (e.name === 'AbortError' || e.name === 'TypeError')
              ? new ApiError(AUTH_ERROR_MESSAGES.NETWORK, 0)
              : e
            onRefreshFailed(err)
            throw err
          } finally {
            isRefreshing = false
          }
        }
      }
    }

    const errorBody = await response.json().catch(() => ({}))
    const message = authMessageFromStatus(response.status)
    throw new ApiError(message, response.status, errorBody)
  }

  return response.json()
  })()

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
      .catch((error) => {
        // * Remove from pending on error too
        pendingRequests.delete(requestKey)
        throw error
      })
  }

  return requestPromise
}

export const authFetch = apiRequest
export default apiRequest
