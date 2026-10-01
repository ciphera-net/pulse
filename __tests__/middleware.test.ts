import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '../middleware'

function createRequest(path: string, cookies: Record<string, string> = {}): NextRequest {
  const url = new URL(path, 'http://localhost:3000')
  const req = new NextRequest(url)
  for (const [name, value] of Object.entries(cookies)) {
    req.cookies.set(name, value)
  }
  return req
}

describe('middleware', () => {
  describe('public routes', () => {
    const publicPaths = [
      '/',
      '/login',
      '/signup',
      '/auth/callback',
      '/pricing',
      // * D43 (the marketing-app split): the dashboard address a future
      // * marketing /pricing button links to. The marketing app has no
      // * session, so it must be reachable exactly as /pricing itself is.
      '/start/plan',
      '/features',
      '/about',
      '/faq',
      '/changelog',
      '/installation',
      '/script.js',
      // * Measured on staging 05-09-2026 BEFORE promotion: without its
      // * PUBLIC_ROUTES entry this 307s to /login, so the readable copy published
      // * to make the minified tracker debuggable could not be fetched from this
      // * origin at all. Same failure class as the next-pwa precache note in
      // * middleware.ts directly below the /script-sri.json entry.
      '/script.debug.js',
      // * /startups is the startups programme's anonymous application page
      // * (05-09-2026), a sibling of /open-source; without its PUBLIC_ROUTES
      // * entry it 307s to /login, the exact failure script.debug.js shipped with.
      '/startups',
      // * Both claim pages must render UNAUTHENTICATED (the login round-trip
      // * loses deep links, so a bounced claim link drops its token). The
      // * startups one shipped in #568 without its entry — measured live
      // * 05-09-2026: /open-source/claim 200, /startups/claim 307 → /login.
      '/open-source/claim',
      '/startups/claim',
      // * The import worker (PULSE-107, M2): a static script loaded by
      // * new Worker(), public source in this public repo. Measured on staging
      // * 27-09-2026: without its entry a request with no session 307s to /login,
      // * so a Worker would be handed HTML — the failure class sw.js and the
      // * tracker files are already exempt from.
      '/workers/import.js',
    ]

    publicPaths.forEach((path) => {
      it(`allows unauthenticated access to ${path}`, () => {
        const res = middleware(createRequest(path))
        // NextResponse.next() does not set a Location header
        expect(res.headers.get('Location')).toBeNull()
      })
    })
  })

  describe('public prefixes', () => {
    it('allows /share/* without auth', () => {
      const res = middleware(createRequest('/share/abc123'))
      expect(res.headers.get('Location')).toBeNull()
    })

    it('allows /integrations without auth', () => {
      const res = middleware(createRequest('/integrations'))
      expect(res.headers.get('Location')).toBeNull()
    })

    it('allows /docs without auth', () => {
      const res = middleware(createRequest('/docs'))
      expect(res.headers.get('Location')).toBeNull()
    })

    // A shared report (PULSE-133) is read by people with no Pulse account, and
    // the PDF runner prints its /print page with no session at all. Without the
    // prefix both would 307 to /login and the runner would print the sign-in page.
    it('allows /r/<token> and /r/<token>/print without auth', () => {
      for (const path of ['/r/7Qx4mK2pLw9Zr', '/r/7Qx4mK2pLw9Zr/print?theme=light&pk=v1.1.abc']) {
        const res = middleware(createRequest(path))
        expect(res.headers.get('Location'), path).toBeNull()
      }
    })

    it('does not open anything else that merely starts with /r', () => {
      const res = middleware(createRequest('/reports'))
      expect(res.headers.get('Location')).toContain('/login')
    })
  })

  describe('protected routes', () => {
    it('redirects unauthenticated users to /login', () => {
      const res = middleware(createRequest('/sites'))
      expect(res.headers.get('Location')).toContain('/login')
    })

    it('redirects unauthenticated users from /settings to /login', () => {
      const res = middleware(createRequest('/settings'))
      expect(res.headers.get('Location')).toContain('/login')
    })

    it('allows access with the pulse_access cookie (S3, host-only)', () => {
      const res = middleware(createRequest('/sites', { pulse_access: 'tok' }))
      expect(res.headers.get('Location')).toBeNull()
    })

    it('allows access with the pulse_refresh cookie only', () => {
      const res = middleware(createRequest('/sites', { pulse_refresh: 'tok' }))
      expect(res.headers.get('Location')).toBeNull()
    })
  })

  describe('auth-only route redirects', () => {
    it('redirects authenticated user from /login to the authed home', () => {
      const res = middleware(createRequest('/login', { pulse_access: 'tok' }))
      const location = res.headers.get('Location')
      expect(location).not.toBeNull()
      expect(new URL(location!).pathname).toBe('/sites')
    })

    it('redirects authenticated user from /signup to the authed home', () => {
      const res = middleware(createRequest('/signup', { pulse_access: 'tok' }))
      const location = res.headers.get('Location')
      expect(location).not.toBeNull()
      expect(new URL(location!).pathname).toBe('/sites')
    })

    it('does NOT redirect from /login with only pulse_refresh (stale session)', () => {
      const res = middleware(createRequest('/login', { pulse_refresh: 'tok' }))
      // Should allow through to /login since only pulse_refresh is present
      expect(res.headers.get('Location')).toBeNull()
    })
  })
})

// ---------------------------------------------------------------------------
// #11 — the cold sign-in gate carries the deep link.
//
// It used to redirect to a bare `/login`, so an emailed dashboard URL or a
// bookmarked settings page signed you in and then dropped you at the front
// door with no explanation — and the link you followed appeared not to work.
// The mechanism to carry it already existed and was already honoured by the
// auth callback (`pulse_auth_return_to`); only this hop never filled it in.
// ---------------------------------------------------------------------------
describe('middleware — a cold visit keeps where it was going', () => {
  it('names the requested path in returnTo', () => {
    const res = middleware(createRequest('/sites/abc/performance'))
    const loc = new URL(res.headers.get('location') as string)
    expect(loc.pathname).toBe('/login')
    expect(loc.searchParams.get('returnTo')).toBe('/sites/abc/performance')
  })

  it('keeps the query string with it', () => {
    const res = middleware(createRequest('/sites/abc?period=7d&tab=pages'))
    const loc = new URL(res.headers.get('location') as string)
    expect(loc.searchParams.get('returnTo')).toBe('/sites/abc?period=7d&tab=pages')
  })

  it('does not bother for the root, which is where they would land anyway', () => {
    // `/` is public, so it never reaches this branch — but if the route table
    // ever changes, a returnTo of '/' is noise, not a deep link.
    const res = middleware(createRequest('/settings'))
    const loc = new URL(res.headers.get('location') as string)
    expect(loc.searchParams.get('returnTo')).toBe('/settings')
  })

  // * The MCP consent page (PULSE-41): an assistant opens it in a browser that
  // * may not be signed in to Pulse. The pending request lives in the query,
  // * so the query must survive the sign-in, or the assistant waits forever.
  it('keeps a /connect request id through the sign-in, and never serves the consent page signed out', () => {
    const res = middleware(createRequest('/connect?request=ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'))
    const loc = new URL(res.headers.get('location') as string)
    expect(loc.pathname).toBe('/login')
    expect(loc.searchParams.get('returnTo')).toBe('/connect?request=ABCDEFGHIJKLMNOPQRSTUVWXYZ234567')
  })

  it('an authenticated visitor is untouched by any of this', () => {
    const res = middleware(createRequest('/settings', { pulse_access: 'tok' }))
    expect(res.headers.get('location')).toBeNull()
  })

  // M5 (PULSE-140): a GA4 sign-in whose state fails to verify lands the Google
  // popup on `/?ga4=invalid_state`. The popup is signed in, so `/` redirects it
  // home, and the code must survive that hop or the popup says nothing at all.
  describe('the GA4 callback code on the homepage', () => {
    it('carries ?ga4= through the signed-in redirect from /', () => {
      const res = middleware(createRequest('/?ga4=invalid_state', { pulse_access: 'tok' }))
      const loc = new URL(res.headers.get('location')!)
      expect(loc.pathname).toBe('/sites')
      expect(loc.searchParams.get('ga4')).toBe('invalid_state')
    })

    it('carries nothing else, and nothing when there is no code', () => {
      const res = middleware(createRequest('/?ga4=invalid_state&next=//evil.example', { pulse_access: 'tok' }))
      const loc = new URL(res.headers.get('location')!)
      expect([...loc.searchParams.keys()]).toEqual(['ga4'])
      const plain = new URL(middleware(createRequest('/', { pulse_access: 'tok' })).headers.get('location')!)
      expect(plain.search).toBe('')
    })
  })
})

