/**
 * OAuth 2.0 PKCE utilities
 */

function generateRandomString(length: number): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const values = new Uint8Array(length)
  crypto.getRandomValues(values)
  return Array.from(values, (x) => charset[x % charset.length]).join('')
}

async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(codeVerifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  
  // Convert ArrayBuffer to Base64URL string
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export interface OAuthParams {
  state: string
  codeVerifier: string
  codeChallenge: string
}

export async function generateOAuthParams(): Promise<OAuthParams> {
  const state = generateRandomString(32)
  const codeVerifier = generateRandomString(64)
  const codeChallenge = await generateCodeChallenge(codeVerifier)

  return {
    state,
    codeVerifier,
    codeChallenge
  }
}

export async function initiateOAuthFlow(redirectPath = '/auth/callback') {
  if (typeof window === 'undefined') return

  const params = await generateOAuthParams()
  const redirectUri = `${window.location.origin}${redirectPath}`
  
  // Store PKCE params in sessionStorage for later use
  sessionStorage.setItem('oauth_state', params.state)
  sessionStorage.setItem('oauth_code_verifier', params.codeVerifier)
  
  const authUrl = process.env.NEXT_PUBLIC_AUTH_URL || 'https://auth.ciphera.net'
  const authApiUrl = process.env.NEXT_PUBLIC_AUTH_API_URL || 'https://auth-api.ciphera.net'
  
  // Redirect to OAuth authorize endpoint
  const authorizeUrl = new URL(`${authApiUrl}/oauth/authorize`)
  authorizeUrl.searchParams.set('client_id', 'analytics-app')
  authorizeUrl.searchParams.set('redirect_uri', redirectUri)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('state', params.state)
  authorizeUrl.searchParams.set('code_challenge', params.codeChallenge)
  authorizeUrl.searchParams.set('code_challenge_method', 'S256')
  
  window.location.href = authorizeUrl.toString()
}
