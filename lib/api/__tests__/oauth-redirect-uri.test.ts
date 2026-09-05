import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// * The tracker fires on both flows; it is not what is under test here.
vi.mock('@/lib/pulse', () => ({ track: vi.fn() }))
vi.mock('../client', () => ({
  ID_URL: 'https://id.ciphera.net',
  APP_URL: 'https://pulse.ciphera.net',
}))

import { initiateOAuthFlow, initiateSignupFlow } from '../oauth'
import { claimPendingAuth } from '../oauth-store'

/**
 * 🔴 THE INVARIANT: the redirect_uri sent to the authorization server and the
 * one stored for the exchange are the SAME STRING, because they are the same
 * value — not two derivations that happen to agree.
 *
 * id-backend records the authorize-time value on the code and later compares it
 * to the exchange's with Go's `!=`: no trailing-slash normalisation, no scheme
 * coercion. Any difference is `400 invalid_grant`, which the callback renders as
 * "This sign-in link has expired" — a configuration error wearing a spent code's
 * clothes, and indistinguishable from one on screen.
 *
 * Until 05-09-2026 authorize used a build-time APP_URL and the exchange used
 * window.location.origin. These tests fail if anyone reintroduces a second
 * derivation, including one that looks equivalent.
 */
function stubLocation(origin: string) {
  Object.defineProperty(window, 'location', {
    value: { origin, href: '' },
    writable: true,
    configurable: true,
  })
}

function sentRedirectUri(): string {
  const url = new URL((window.location as unknown as { href: string }).href)
  return url.searchParams.get('redirect_uri') ?? ''
}

function sentState(): string {
  const url = new URL((window.location as unknown as { href: string }).href)
  return url.searchParams.get('state') ?? ''
}

beforeEach(() => {
  localStorage.clear()
  stubLocation('https://pulse.ciphera.net')
})
afterEach(() => vi.clearAllMocks())

describe('initiateOAuthFlow', () => {
  it('stores exactly the redirect_uri it sends', async () => {
    await initiateOAuthFlow()
    const stored = claimPendingAuth(sentState())
    expect(stored?.redirectUri).toBe(sentRedirectUri())
    expect(sentRedirectUri()).toBe('https://pulse.ciphera.net/auth/callback')
  })

  it('follows the browser to whatever origin it is actually on', async () => {
    // Staging is a different host with its own allowlist entry. A build-time
    // constant would send the production URL from here and fail at the exchange.
    stubLocation('https://pulse-staging.ciphera.net')
    await initiateOAuthFlow()
    expect(sentRedirectUri()).toBe('https://pulse-staging.ciphera.net/auth/callback')
    expect(claimPendingAuth(sentState())?.redirectUri).toBe(sentRedirectUri())
  })

  it('sends one redirect_uri for a non-default return path, and stores that one', async () => {
    await initiateOAuthFlow('/auth/callback')
    expect(claimPendingAuth(sentState())?.redirectUri).toBe(sentRedirectUri())
  })
})

describe('initiateSignupFlow', () => {
  it('stores exactly the redirect_uri it sends', async () => {
    await initiateSignupFlow()
    expect(claimPendingAuth(sentState())?.redirectUri).toBe(sentRedirectUri())
    expect(sentRedirectUri()).toBe('https://pulse.ciphera.net/auth/callback')
  })
})

describe('the two flows do not clobber each other', () => {
  it('keeps a login and a signup attempt on their own entries', async () => {
    await initiateOAuthFlow()
    const loginState = sentState()
    const loginUri = sentRedirectUri()
    await initiateSignupFlow()
    const signupState = sentState()

    expect(loginState).not.toBe(signupState)
    expect(claimPendingAuth(signupState)?.redirectUri).toBe(sentRedirectUri())
    expect(claimPendingAuth(loginState)?.redirectUri).toBe(loginUri)
  })
})
