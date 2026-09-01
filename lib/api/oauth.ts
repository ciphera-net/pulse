import { ID_URL, APP_URL } from './client'
import { rememberPendingAuth } from './oauth-store'
import { track } from '@/lib/pulse'

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

  // * Store this attempt under its own state so a second attempt — another tab,
  // * a marketing CTA, a re-mounted /login — cannot overwrite it.
  rememberPendingAuth(state, codeVerifier)

  // * Ensure clean URL construction without double slashes
  const baseUrl = APP_URL.endsWith('/') ? APP_URL.slice(0, -1) : APP_URL
  const path = redirectPath.startsWith('/') ? redirectPath : `/${redirectPath}`
  const redirectUri = encodeURIComponent(`${baseUrl}${path}`)

  const loginUrl = `${ID_URL}/login?client_id=pulse-app&redirect_uri=${redirectUri}&response_type=code&prompt=select_account&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`

  track('login_flow_started')
  window.location.href = loginUrl
}

export async function initiateSignupFlow(redirectPath = '/auth/callback') {
    if (typeof window === 'undefined') return
  
    const { state, codeVerifier, codeChallenge } = await generateOAuthParams()

    // * Per-attempt entry, same as the login flow — a signup started alongside a
    // * login must not clobber it.
    rememberPendingAuth(state, codeVerifier)

    // * Ensure clean URL construction without double slashes
    const baseUrl = APP_URL.endsWith('/') ? APP_URL.slice(0, -1) : APP_URL
    const path = redirectPath.startsWith('/') ? redirectPath : `/${redirectPath}`
    const redirectUri = encodeURIComponent(`${baseUrl}${path}`)
    
    const signupUrl = `${ID_URL}/signup?client_id=pulse-app&redirect_uri=${redirectUri}&response_type=code&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`

    track('signup_flow_started')
    window.location.href = signupUrl
  }