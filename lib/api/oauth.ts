import { AUTH_URL, APP_URL } from './client'

function generateRandomString(length: number): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  let result = ''
  const values = new Uint8Array(length)
  crypto.getRandomValues(values)
  for (let i = 0; i < length; i++) {
    result += charset[values[i] % charset.length]
  }
  return result
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

  const { state, codeVerifier, codeChallenge } = await generateOAuthParams()

  // Store params for verification in callback
  localStorage.setItem('oauth_state', state)
  localStorage.setItem('oauth_code_verifier', codeVerifier)

  const redirectUri = encodeURIComponent(`${APP_URL}${redirectPath}`)
  
  const loginUrl = `${AUTH_URL}/login?client_id=pulse-app&redirect_uri=${redirectUri}&response_type=code&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`

  window.location.href = loginUrl
}

export async function initiateSignupFlow(redirectPath = '/auth/callback') {
    if (typeof window === 'undefined') return
  
    const { state, codeVerifier, codeChallenge } = await generateOAuthParams()
  
    // Store params for verification in callback
    localStorage.setItem('oauth_state', state)
    localStorage.setItem('oauth_code_verifier', codeVerifier)
  
    const redirectUri = encodeURIComponent(`${APP_URL}${redirectPath}`)
    
    const signupUrl = `${AUTH_URL}/signup?client_id=pulse-app&redirect_uri=${redirectUri}&response_type=code&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`
  
    window.location.href = signupUrl
  }
