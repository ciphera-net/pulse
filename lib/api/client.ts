/**
 * HTTP client wrapper for API calls
 */

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
let refreshSubscribers: (() => void)[] = []

function subscribeToTokenRefresh(cb: () => void) {
  refreshSubscribers.push(cb)
}

function onRefreshed() {
  refreshSubscribers.map((cb) => cb())
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
  const url = `${baseUrl}/api/v1${endpoint}`
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  }

  // * We rely on HttpOnly cookies, so no manual Authorization header injection.
  // * We MUST set credentials: 'include' for the browser to send cookies cross-origin (or same-site).

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // * IMPORTANT: Send cookies
  })

  if (!response.ok) {
    if (response.status === 401) {
      // * Attempt Token Refresh if 401
      if (typeof window !== 'undefined') {
        // * Prevent infinite loop: Don't refresh if the failed request WAS a refresh request (unlikely via apiRequest but safe to check)
        if (!endpoint.includes('/auth/refresh')) {
          if (isRefreshing) {
            // * If refresh is already in progress, wait for it to complete
            return new Promise((resolve, reject) => {
              subscribeToTokenRefresh(async () => {
                // Retry original request (browser uses new cookie)
                try {
                  const retryResponse = await fetch(url, {
                    ...options,
                    headers,
                    credentials: 'include',
                  })
                  if (retryResponse.ok) {
                    resolve(retryResponse.json())
                  } else {
                    reject(new ApiError('Retry failed', retryResponse.status))
                  }
                } catch (e) {
                  reject(e)
                }
              })
            })
          }

          isRefreshing = true

          try {
            // * Call our internal Next.js API route to handle refresh securely
            const refreshRes = await fetch('/api/auth/refresh', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
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
              // * Refresh failed, logout
              localStorage.removeItem('user')
              // * Redirect to login if needed, or let the app handle 401
              // window.location.href = '/'
            }
          } catch (e) {
            // * Network error during refresh
            throw e
          } finally {
            isRefreshing = false
          }
        }
      }
    }

    const errorBody = await response.json().catch(() => ({
      error: 'Unknown error',
      message: `HTTP ${response.status}: ${response.statusText}`,
    }))
    throw new ApiError(errorBody.message || errorBody.error || 'Request failed', response.status, errorBody)
  }

  return response.json()
}

export const authFetch = apiRequest
export default apiRequest
