     1|/**
     2| * HTTP client wrapper for API calls
     3| */
     4|
     5|export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8082'
     6|export const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL || 'http://localhost:3000'
     7|export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3003'
     8|export const AUTH_API_URL = process.env.NEXT_PUBLIC_AUTH_API_URL || 'https://auth-api.ciphera.net'
     9|
    10|export function getLoginUrl(redirectPath = '/auth/callback') {
    11|  const redirectUri = encodeURIComponent(`${APP_URL}${redirectPath}`)
    12|  return `${AUTH_URL}/login?client_id=analytics-app&redirect_uri=${redirectUri}&response_type=code`
    13|}
    14|
    15|export function getSignupUrl(redirectPath = '/auth/callback') {
    16|  const redirectUri = encodeURIComponent(`${APP_URL}${redirectPath}`)
    17|  return `${AUTH_URL}/signup?client_id=analytics-app&redirect_uri=${redirectUri}&response_type=code`
    18|}
    19|
    20|export class ApiError extends Error {
    21|  status: number
    22|  constructor(message: string, status: number) {
    23|    super(message)
    24|    this.status = status
    25|  }
    26|}
    27|
    28|// * Mutex for token refresh
    29|let isRefreshing = false
    30|let refreshSubscribers: (() => void)[] = []
    31|
    32|function subscribeToTokenRefresh(cb: () => void) {
    33|  refreshSubscribers.push(cb)
    34|}
    35|
    36|function onRefreshed() {
    37|  refreshSubscribers.map((cb) => cb())
    38|  refreshSubscribers = []
    39|}
    40|
    41|/**
    42| * Base API client with error handling
    43| */
    44|async function apiRequest<T>(
    45|  endpoint: string,
    46|  options: RequestInit = {}
    47|): Promise<T> {
    48|  // * Determine base URL
    49|  const isAuthRequest = endpoint.startsWith('/auth')
    50|  const baseUrl = isAuthRequest ? AUTH_API_URL : API_URL
    51|  const url = `${baseUrl}/api/v1${endpoint}`
    52|  
    53|  const headers: HeadersInit = {
    54|    'Content-Type': 'application/json',
    55|    ...options.headers,
    56|  }
    57|
    58|  // * We rely on HttpOnly cookies, so no manual Authorization header injection.
    59|  // * We MUST set credentials: 'include' for the browser to send cookies cross-origin (or same-site).
    60|
    61|  const response = await fetch(url, {
    62|    ...options,
    63|    headers,
    64|    credentials: 'include', // * IMPORTANT: Send cookies
    65|  })
    66|
    67|  if (!response.ok) {
    68|    if (response.status === 401) {
    69|      // * Attempt Token Refresh if 401
    70|      if (typeof window !== 'undefined') {
    71|        // * Prevent infinite loop: Don't refresh if the failed request WAS a refresh request (unlikely via apiRequest but safe to check)
    72|        if (!endpoint.includes('/auth/refresh')) {
    73|          if (isRefreshing) {
    74|            // * If refresh is already in progress, wait for it to complete
    75|            return new Promise((resolve, reject) => {
    76|              subscribeToTokenRefresh(async () => {
    77|                // Retry original request (browser uses new cookie)
    78|                try {
    79|                  const retryResponse = await fetch(url, {
    80|                    ...options,
    81|                    headers,
    82|                    credentials: 'include',
    83|                  })
    84|                  if (retryResponse.ok) {
    85|                    resolve(retryResponse.json())
    86|                  } else {
    87|                    reject(new ApiError('Retry failed', retryResponse.status))
    88|                  }
    89|                } catch (e) {
    90|                  reject(e)
    91|                }
    92|              })
    93|            })
    94|          }
    95|
    96|          isRefreshing = true
    97|
    98|          try {
    99|            // * Call our internal Next.js API route to handle refresh securely
   100|            const refreshRes = await fetch('/api/auth/refresh', {
   101|              method: 'POST',
   102|              headers: { 'Content-Type': 'application/json' },
   103|            })
   104|
   105|            if (refreshRes.ok) {
   106|              // * Refresh successful, cookies updated
   107|              onRefreshed()
   108|
   109|              // * Retry original request
   110|              const retryResponse = await fetch(url, {
   111|                ...options,
   112|                headers,
   113|                credentials: 'include',
   114|              })
   115|              
   116|              if (retryResponse.ok) {
   117|                return retryResponse.json()
   118|              }
   119|            } else {
   120|              // * Refresh failed, logout
   121|              localStorage.removeItem('user')
   122|              // * Redirect to login if needed, or let the app handle 401
   123|              // window.location.href = '/'
   124|            }
   125|          } catch (e) {
   126|            // * Network error during refresh
   127|            throw e
   128|          } finally {
   129|            isRefreshing = false
   130|          }
   131|        }
   132|      }
   133|    }
   134|
   135|    const errorBody = await response.json().catch(() => ({
   136|      error: 'Unknown error',
   137|      message: `HTTP ${response.status}: ${response.statusText}`,
   138|    }))
   139|    throw new ApiError(errorBody.message || errorBody.error || 'Request failed', response.status)
   140|  }
   141|
   142|  return response.json()
   143|}
   144|
   145|export const authFetch = apiRequest
   146|export default apiRequest
   147|