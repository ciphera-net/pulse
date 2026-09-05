import { describe, it, expect, beforeEach } from 'vitest'
import {
  rememberPendingAuth,
  claimPendingAuth,
  prunePendingAuth,
  forgetAllPendingAuth,
  PENDING_MAX_AGE_MS,
} from '../oauth-store'

const T0 = 1_700_000_000_000
// * The redirect_uri an attempt sends at authorize. Stored with the attempt so the
// * exchange can send the same bytes back — id-backend compares them exactly.
const RURI = 'https://pulse.ciphera.net/auth/callback'

beforeEach(() => {
  localStorage.clear()
})

describe('oauth-store — concurrent attempts', () => {
  it('keeps every attempt separately, so a later one cannot clobber an earlier one', () => {
    // * The reported failure: /login mounts twice (logout redirect, then a return
    // * through Pulse). Attempt A must still complete after B has started.
    rememberPendingAuth('state-A', 'verifier-A', RURI, T0)
    rememberPendingAuth('state-B', 'verifier-B', RURI, T0 + 1_000)

    expect(claimPendingAuth('state-A', T0 + 2_000)?.verifier).toBe('verifier-A')
    expect(claimPendingAuth('state-B', T0 + 2_000)?.verifier).toBe('verifier-B')
  })

  it('resolves the right verifier with many attempts in flight', () => {
    for (let i = 0; i < 5; i++) {
      rememberPendingAuth(`state-${i}`, `verifier-${i}`, RURI, T0 + i)
    }
    // * Deliberately out of order — completion order is not start order.
    expect(claimPendingAuth('state-3', T0 + 10)?.verifier).toBe('verifier-3')
    expect(claimPendingAuth('state-0', T0 + 10)?.verifier).toBe('verifier-0')
    expect(claimPendingAuth('state-4', T0 + 10)?.verifier).toBe('verifier-4')
  })

  it('does not disturb other attempts when one is claimed', () => {
    rememberPendingAuth('state-A', 'verifier-A', RURI, T0)
    rememberPendingAuth('state-B', 'verifier-B', RURI, T0)

    claimPendingAuth('state-A', T0 + 1_000)

    expect(claimPendingAuth('state-B', T0 + 1_000)?.verifier).toBe('verifier-B')
  })
})

describe('oauth-store — unknown and forged state', () => {
  it('returns null for a state that was never issued', () => {
    rememberPendingAuth('state-A', 'verifier-A', RURI, T0)
    // * The negative control. A forged state must not resolve to some other
    // * attempt's verifier, and must not fall through to "no validation needed".
    expect(claimPendingAuth('forged-state', T0)).toBeNull()
  })

  it('returns null when nothing at all is pending', () => {
    expect(claimPendingAuth('state-A', T0)).toBeNull()
  })

  it('never stores an attempt under an empty state', () => {
    rememberPendingAuth('', 'verifier-A', RURI, T0)
    expect(localStorage.getItem('oauth_pending:')).toBeNull()
  })

  it('refuses to claim the bare-prefix key with an empty state', () => {
    // * An empty state must not be usable as a sentinel that matches a stray
    // * `oauth_pending:` entry — otherwise stripping `state` from the callback
    // * URL becomes a way to pick up someone else's verifier.
    localStorage.setItem(
      'oauth_pending:',
      JSON.stringify({ verifier: 'verifier-A', createdAt: T0 })
    )
    expect(claimPendingAuth('', T0)).toBeNull()
  })

  it('returns null for a malformed entry instead of trusting a partial one', () => {
    localStorage.setItem('oauth_pending:state-A', 'not json')
    expect(claimPendingAuth('state-A', T0)).toBeNull()

    localStorage.setItem('oauth_pending:state-B', JSON.stringify({ createdAt: T0 }))
    expect(claimPendingAuth('state-B', T0)).toBeNull()

    localStorage.setItem('oauth_pending:state-C', JSON.stringify({ verifier: 'v' }))
    expect(claimPendingAuth('state-C', T0)).toBeNull()
  })
})

describe('oauth-store — expiry by age', () => {
  it('accepts an attempt just inside the window', () => {
    rememberPendingAuth('state-A', 'verifier-A', RURI, T0)
    expect(claimPendingAuth('state-A', T0 + PENDING_MAX_AGE_MS)?.verifier).toBe('verifier-A')
  })

  it('rejects an attempt past the window', () => {
    rememberPendingAuth('state-A', 'verifier-A', RURI, T0)
    expect(claimPendingAuth('state-A', T0 + PENDING_MAX_AGE_MS + 1)).toBeNull()
  })

  it('rejects an entry created in the future (clock change or tampering)', () => {
    rememberPendingAuth('state-A', 'verifier-A', RURI, T0 + 60_000)
    expect(claimPendingAuth('state-A', T0)).toBeNull()
  })

  it('expires by age only — never by which page was visited', () => {
    // * The silent security bug: cleanup keyed on route deleted the in-flight
    // * keys whenever the user touched any page that was not the callback, so
    // * the callback then skipped state validation entirely.
    rememberPendingAuth('state-A', 'verifier-A', RURI, T0)

    prunePendingAuth(T0 + 1_000) // an app init on some other route, mid-flow

    expect(claimPendingAuth('state-A', T0 + 2_000)?.verifier).toBe('verifier-A')
  })

  it('prune drops only the aged-out attempts', () => {
    rememberPendingAuth('old', 'verifier-old', RURI, T0)
    rememberPendingAuth('fresh', 'verifier-fresh', RURI, T0 + PENDING_MAX_AGE_MS)

    prunePendingAuth(T0 + PENDING_MAX_AGE_MS + 1)

    expect(claimPendingAuth('old', T0 + PENDING_MAX_AGE_MS + 1)).toBeNull()
    expect(claimPendingAuth('fresh', T0 + PENDING_MAX_AGE_MS + 1)?.verifier).toBe('verifier-fresh')
  })

  it('prune removes every aged-out attempt, not just the first', () => {
    // * Guards the index-shift bug: removing while walking localStorage by index
    // * skips entries, which would leave stale attempts behind.
    for (let i = 0; i < 6; i++) rememberPendingAuth(`old-${i}`, `v-${i}`, RURI, T0)

    prunePendingAuth(T0 + PENDING_MAX_AGE_MS + 1)

    const left = Object.keys(localStorage).filter((k) => k.startsWith('oauth_pending:'))
    expect(left).toEqual([])
  })
})

describe('oauth-store — single use', () => {
  it('consumes the entry so a replayed callback URL cannot be exchanged twice', () => {
    rememberPendingAuth('state-A', 'verifier-A', RURI, T0)

    expect(claimPendingAuth('state-A', T0)?.verifier).toBe('verifier-A')
    expect(claimPendingAuth('state-A', T0)).toBeNull()
  })

  it('consumes an expired entry too', () => {
    rememberPendingAuth('state-A', 'verifier-A', RURI, T0)
    claimPendingAuth('state-A', T0 + PENDING_MAX_AGE_MS + 1)
    expect(localStorage.getItem('oauth_pending:state-A')).toBeNull()
  })
})

describe('oauth-store — housekeeping', () => {
  it('forgets every attempt on demand (logout, restarting a failed sign-in)', () => {
    rememberPendingAuth('state-A', 'verifier-A', RURI, T0)
    rememberPendingAuth('state-B', 'verifier-B', RURI, T0)

    forgetAllPendingAuth()

    expect(claimPendingAuth('state-A', T0)).toBeNull()
    expect(claimPendingAuth('state-B', T0)).toBeNull()
  })

  it('removes the dead single-slot keys when they are carried over a deploy', () => {
    localStorage.setItem('oauth_state', 'legacy-state')
    localStorage.setItem('oauth_code_verifier', 'legacy-verifier')

    prunePendingAuth(T0)

    expect(localStorage.getItem('oauth_state')).toBeNull()
    expect(localStorage.getItem('oauth_code_verifier')).toBeNull()
  })

  it('leaves unrelated storage alone', () => {
    localStorage.setItem('user', '{"id":"u1"}')
    localStorage.setItem('pulse_auth_return_to', '/sites')
    rememberPendingAuth('state-A', 'verifier-A', RURI, T0)

    forgetAllPendingAuth()

    expect(localStorage.getItem('user')).toBe('{"id":"u1"}')
    expect(localStorage.getItem('pulse_auth_return_to')).toBe('/sites')
  })
})

// ---------------------------------------------------------------------------
// The redirect_uri travels WITH the attempt.
//
// 🔴 id-backend compares the exchange's redirect_uri against the one recorded at
// authorize using Go's `!=` — no trailing-slash normalisation, no scheme
// coercion — and answers 400 `invalid_grant` on any difference, which Pulse
// renders as "This sign-in link has expired". Before 05-09-2026 the value was
// computed twice from two different sources (a build-time APP_URL at authorize,
// window.location.origin at the exchange) and agreed only by coincidence. These
// pin that it is stored once and read back, never derived a second time.
// ---------------------------------------------------------------------------
describe('the redirect_uri is remembered, not recomputed', () => {
  it('returns the exact string the attempt was started with', () => {
    rememberPendingAuth('state-A', 'verifier-A', RURI, T0)
    expect(claimPendingAuth('state-A', T0 + 1_000)?.redirectUri).toBe(RURI)
  })

  it('keeps each concurrent attempt on its own origin', () => {
    // Two tabs, two hosts, two attempts in the one shared localStorage.
    rememberPendingAuth('state-A', 'verifier-A', 'https://pulse.ciphera.net/auth/callback', T0)
    rememberPendingAuth('state-B', 'verifier-B', 'https://pulse-staging.ciphera.net/auth/callback', T0)
    expect(claimPendingAuth('state-B', T0)?.redirectUri).toBe('https://pulse-staging.ciphera.net/auth/callback')
    expect(claimPendingAuth('state-A', T0)?.redirectUri).toBe('https://pulse.ciphera.net/auth/callback')
  })

  it('reads an attempt written before this shipped as having no redirect_uri, not as a broken entry', () => {
    // The exact shape the previous release wrote. It must still be claimable —
    // the callback recovers what that release sent — and it must report the
    // field as absent rather than inventing a value.
    localStorage.setItem(
      'oauth_pending:legacy',
      JSON.stringify({ verifier: 'verifier-legacy', createdAt: T0 }),
    )
    const claimed = claimPendingAuth('legacy', T0 + 1_000)
    expect(claimed?.verifier).toBe('verifier-legacy')
    expect(claimed?.redirectUri).toBeUndefined()
  })

  it('treats a non-string redirect_uri as absent rather than passing it through', () => {
    localStorage.setItem(
      'oauth_pending:tampered',
      JSON.stringify({ verifier: 'v', createdAt: T0, redirectUri: 42 }),
    )
    expect(claimPendingAuth('tampered', T0)?.redirectUri).toBeUndefined()
  })

  it('treats an empty redirect_uri as absent — an empty string is not an origin', () => {
    localStorage.setItem(
      'oauth_pending:empty',
      JSON.stringify({ verifier: 'v', createdAt: T0, redirectUri: '' }),
    )
    expect(claimPendingAuth('empty', T0)?.redirectUri).toBeUndefined()
  })
})

