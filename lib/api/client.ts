/**
 * HTTP client wrapper for API calls
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8082'
export const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL || 'http://localhost:3000'
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3003'
export const AUTH_API_URL = process.env.NEXT_PUBLIC_AUTH_API_URL || 'http://localhost:8081'

export function getLoginUrl(redirectPath = '/auth/callback') {
  const redirectUri = encodeURIComponent(`${APP_URL}${redirectPath}`)
  return `${AUTH_URL}/login?client_id=analytics-app&redirect_uri=${redirectUri}&response_type=code`
}

export function getSignupUrl(redirectPath = '/auth/callback') {
  const redirectUri = encodeURIComponent(`${APP_URL}${redirectPath}`)
  return `${AUTH_URL}/signup?client_id=analytics-app&redirect_uri=${redirectUri}&response_type=code`
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

// * Mutex for token refresh
let isRefreshing = false
let refreshSubscribers: ((token: string) => void)[] = []

function subscribeToTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb)
}

function onRefreshed(token: string) {
  refreshSubscribers.map((cb) => cb(token))
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

  // Inject Auth Token if available (Client-side only)
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token')
    if (token) {
      (headers as any)['Authorization'] = `Bearer ${token}`
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  if (!response.ok) {
    if (response.status === 401) {
      // * Attempt Token Refresh if 401
      if (typeof window !== 'undefined') {
        const refreshToken = localStorage.getItem('refreshToken')
        
        // * Prevent infinite loop: Don't refresh if the failed request WAS a refresh request
        if (refreshToken && !endpoint.includes('/auth/refresh')) {
          if (isRefreshing) {
            // * If refresh is already in progress, wait for it to complete
            return new Promise((resolve, reject) => {
              subscribeToTokenRefresh(async (newToken) => {
                // Retry original request with new token
                const newHeaders = {
                  ...headers,
                  'Authorization': `Bearer ${newToken}`,
                }
                try {
                  const retryResponse = await fetch(url, {
                    ...options,
                    headers: newHeaders,
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
            const refreshRes = await fetch(`${AUTH_API_URL}/api/v1/auth/refresh`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                  refresh_token: refreshToken,
              }),
            })

            if (refreshRes.ok) {
              const data = await refreshRes.json()
              localStorage.setItem('token', data.access_token)
              localStorage.setItem('refreshToken', data.refresh_token) // Rotation
              
              // Notify waiting requests
              onRefreshed(data.access_token)

              // * Retry original request with new token
              const newHeaders = {
                ...headers,
                'Authorization': `Bearer ${data.access_token}`,
              }
              const retryResponse = await fetch(url, {
                ...options,
                headers: newHeaders,
              })
              
              if (retryResponse.ok) {
                return retryResponse.json()
              }
            } else {
              // * Refresh failed, logout
              localStorage.removeItem('token')
              localStorage.removeItem('refreshToken')
              localStorage.removeItem('user')
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
    throw new ApiError(errorBody.message || errorBody.error || 'Request failed', response.status)
  }

  return response.json()
}

export const authFetch = apiRequest
export default apiRequest
