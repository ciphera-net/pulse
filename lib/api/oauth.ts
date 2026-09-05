import { ID_URL } from './client'
import { rememberPendingAuth } from './oauth-store'
import { track } from '@/lib/pulse'

/**
 * The `redirect_uri` for this browser, computed ONCE per attempt and then
 * remembered, never recomputed at the exchange.
 *
 * 🔴 It reads `window.location.origin` rather than the build-time `APP_URL`,
 * and that choice is load-bearing in a way that is easy to get backwards.
 * id-backend checks the authorize-time value against an exact-match allowlist
 * and 400s `invalid_redirect_uri` on a miss. So with the ORIGIN, a browser on a
 * host we do not serve fails immediately, at the start of the ceremony, naming
 * the real problem. With `APP_URL`, that same browser sails through authorize —
 * the constant is always in the allowlist — and fails at the token exchange
 * instead, as `400 invalid_grant`, which Pulse renders as "This sign-in link has
 * expired". A build-time constant does not prevent the mismatch; it hides it,
 * and moves the failure to the point where it is indistinguishable from a spent
 * code.
 *
 * The live allowlist for `pulse-app` is exactly `pulse.ciphera.net`,
 * `pulse-staging.ciphera.net` and `localhost:3003` — every host the app is
 * actually served from.
 */
function attemptRedirectUri(redirectPath: string): string {
  const path = redirectPath.startsWith('/') ? redirectPath : `/${redirectPath}`
  return `${window.location.origin}${path}`
}

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

  const redirectUri = attemptRedirectUri(redirectPath)

  // * Store this attempt under its own state so a second attempt — another tab,
  // * a marketing CTA, a re-mounted /login — cannot overwrite it. The redirect_uri
  // * is stored WITH it: the exchange must send this exact string back, and the
  // * only way to guarantee that is to keep it rather than derive it twice.
  rememberPendingAuth(state, codeVerifier, redirectUri)

  const loginUrl = `${ID_URL}/login?client_id=pulse-app&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&prompt=select_account&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`

  track('login_flow_started')
  window.location.href = loginUrl
}

export async function initiateSignupFlow(redirectPath = '/auth/callback') {
    if (typeof window === 'undefined') return
  
    const { state, codeVerifier, codeChallenge } = await generateOAuthParams()

    const redirectUri = attemptRedirectUri(redirectPath)

    // * Per-attempt entry, same as the login flow — a signup started alongside a
    // * login must not clobber it, and it carries its own redirect_uri.
    rememberPendingAuth(state, codeVerifier, redirectUri)

    const signupUrl = `${ID_URL}/signup?client_id=pulse-app&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`

    track('signup_flow_started')
    window.location.href = signupUrl
  }