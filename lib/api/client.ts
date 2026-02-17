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

export class ApiError extends Error {
  status: number
  data?: any
  
  constructor(message: string, status: number, data?: any) {
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

/**
 * Base API client with error handling
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  // * Determine base URL
  const isAuthRequest = endpoint.startsWith('/auth')
  const baseUrl = isAuthRequest ? AUTH_API_URL : API_URL
  
  // * Handle legacy endpoints that already include /api/ prefix
  const url = endpoint.startsWith('/api/') 
    ? `${baseUrl}${endpoint}`
    : `${baseUrl}/api/v1${endpoint}`
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  // * We rely on HttpOnly cookies, so no manual Authorization header injection.
  // * We MUST set credentials: 'include' for the browser to send cookies cross-origin (or same-site).

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  const signal = options.signal ?? controller.signal

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
}

// * Legacy axios-style client for compatibility
export function getClient() {
  return {
    post: async (endpoint: string, body: any) => {
      // Handle the case where endpoint might start with /api (remove it if our base client adds it, OR adjust usage)
      // Our apiRequest adds /api/v1 prefix.
      // If we pass /api/billing/checkout, apiRequest makes it /api/v1/api/billing/checkout -> Wrong.
      // We should probably just expose apiRequest directly or wrap it properly.
      
      // Let's adapt the endpoint:
      // If endpoint starts with /api/, strip it because apiRequest adds /api/v1
      // BUT WAIT: The backend billing endpoint is likely at /api/billing/checkout (not /api/v1/billing/checkout) if I registered it at root group?
      // Let's check backend routing.
      // In main.go: billingGroup := router.Group("/api/billing") -> so it is at /api/billing/... NOT /api/v1/billing...
      
      // So we need a raw fetch for this, or modify apiRequest to support non-v1 routes.
      // For now, let's just implement a simple fetch wrapper that mimics axios
      
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const headers: any = { 'Content-Type': 'application/json' }
      // Although we use cookies, sometimes we might fallback to token if cookies fail? 
      // Pulse uses cookies primarily now.
      
      const url = `${API_URL}${endpoint}`
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        credentials: 'include'
      })
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Request failed')
      }
      
      return { data: await res.json() }
    }
  }
}

export const authFetch = apiRequest
export default apiRequest
