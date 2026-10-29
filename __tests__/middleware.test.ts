import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '../middleware'

function createRequest(path: string, cookies: Record<string, string> = {}, host?: string): NextRequest {
  const url = new URL(path, 'http://localhost:3000')
  // * `host` is the Host HEADER, which is what the middleware reads. The URL above never carries it.
  const req = new NextRequest(url, host === undefined ? undefined : { headers: { host } })
  for (const [name, value] of Object.entries(cookies)) {
    req.cookies.set(name, value)
  }
  return req
}

describe('middleware', () => {
  describe('public routes', () => {
    const publicPaths = [
      '/login',
      '/signup',
      '/auth/callback',
      // * D43 (the marketing-app split): the dashboard address the marketing
      // * app's /pricing buttons link to. The marketing app has no session, so
      // * it must be reachable exactly as /pricing itself is.
      '/start/plan',
      // * The live demo IS the dashboard (D36) — public, indexable, no session.
      '/demo',
      '/script.js',
      // * Measured on staging 05-09-2026 BEFORE promotion: without its
      // * PUBLIC_ROUTES entry this 307s to /login, so the readable copy published
      // * to make the minified tracker debuggable could not be fetched from this
      // * origin at all. Same failure class as the next-pwa precache note in
      // * middleware.ts directly below the /script-sri.json entry.
      '/script.debug.js',
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

    // The demo's pages (PUL-34): /demo/pages, /demo/funnels/<id>, … are the product's real
    // pages over the sample site. Only the bare /demo was public, so a link to any other page
    // opened signed out would have bounced to /login.
    it('allows every page of the demo, and a share link\'s pages, without auth', () => {
      for (const path of ['/demo', '/demo/pages', '/demo/journeys', '/demo/funnels', '/demo/funnels/f-1', '/demo/performance', '/share/abc123/pages', '/share/abc123/funnels/f-1']) {
        const res = middleware(createRequest(path))
        expect(res.headers.get('Location'), path).toBeNull()
      }
    })

    it('does not open anything else that merely starts with /demo', () => {
      for (const path of ['/demonstration', '/demos', '/demo-site']) {
        const res = middleware(createRequest(path))
        expect(res.headers.get('Location'), path).toContain('/login')
      }
    })

    // 🔑 The edge caches /demo* for 300 s under a key that ignores cookies, so the answer for a
    // signed-in visitor must be exactly the answer for an anonymous one: no redirect, no cookie
    // set, no header that differs. (The page itself reads nothing from the session either.)
    it('answers the demo identically for a signed-in visitor and an anonymous one', () => {
      const session = { pulse_access: 'a.b.c', pulse_refresh: 'r' }
      for (const path of ['/demo', '/demo/pages', '/demo/funnels/f-1', '/share/abc123', '/share/abc123/pages']) {
        const anonymous = middleware(createRequest(path))
        const signedIn = middleware(createRequest(path, session))
        expect(signedIn.headers.get('Location'), path).toBeNull()
        expect(signedIn.headers.get('set-cookie'), path).toBeNull()
        expect(Object.fromEntries(signedIn.headers.entries()), path).toEqual(Object.fromEntries(anonymous.headers.entries()))
        expect(signedIn.status, path).toBe(anonymous.status)
      }
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

  // * B7 (06-10-2026): the marketing pages render in ciphera-net/pulse-website and the
  // * Ingress sends their paths there, so on THIS app they are ordinary unlisted
  // * paths. Re-adding one to PUBLIC_ROUTES would make the dashboard answer for a
  // * page it no longer has.
  describe('marketing paths are not public here (B7)', () => {
    const marketingPaths = [
      '/pricing',
      '/features',
      '/about',
      '/faq',
      '/changelog',
      '/installation',
      '/contact',
      '/open-source',
      '/startups',
      '/cookieless-analytics',
      '/integrations',
      '/integrations/nextjs',
      '/vs/plausible',
      '/tools/utm-builder',
      '/sys/seo-state',
    ]

    marketingPaths.forEach((path) => {
      it(`sends an anonymous ${path} to /login`, () => {
        const res = middleware(createRequest(path))
        expect(res.headers.get('Location')).toContain('/login')
      })
    })

    it('sends an anonymous / to /login without a returnTo', () => {
      const location = middleware(createRequest('/')).headers.get('Location')
      expect(location).not.toBeNull()
      const url = new URL(location!)
      expect(url.pathname).toBe('/login')
      expect(url.searchParams.has('returnTo')).toBe(false)
    })

    it('still sends a signed-in / to the authed home', () => {
      const location = middleware(createRequest('/', { pulse_access: 'tok' })).headers.get('Location')
      expect(location).not.toBeNull()
      expect(new URL(location!).pathname).toBe('/sites')
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

// ---------------------------------------------------------------------------
// Staging is reached under more than one name, and every one of them must be noindex.
//
// Behind the access proxy the pod is asked for the ORIGIN'S OWN NAME, not the name in the
// browser's address bar, so a check against the public name alone saw no staging request at all:
// no X-Robots-Tag on any response and no blanket-Disallow robots.txt. The match is POSITIVE (a
// set of exact hosts), so production can never be tagged by accident, whatever Host its edge
// forwards.
// ---------------------------------------------------------------------------
describe('middleware — staging hosts are noindex, and only staging hosts', () => {
  const STAGING_HOSTS = [
    'pulse-staging.teleport.ciphera.net', // the name in the browser
    'pulse-staging-sks.ciphera.net', // the Host the access proxy sends to the pod
    'pulse-staging.ciphera.net', // the former public name, until it is retired
  ]

  // * Production's hosts, local development, and near-misses of every staging host. A near-miss is
  // * a host that merely CONTAINS a staging name; none of them is staging.
  const NOT_STAGING = [
    'pulse.ciphera.net',
    'pulse-api.ciphera.net',
    'ciphera.net',
    'www.ciphera.net',
    'id.ciphera.net',
    'teleport.ciphera.net',
    'localhost',
    'localhost:3000',
    'localhost:3003',
    'pulse-staging.teleport.ciphera.net.example.com',
    'evil-pulse-staging.teleport.ciphera.net',
    'pulse-staging-sks.ciphera.net.example.com',
    'x.pulse-staging.ciphera.net',
    'pulse-staging.ciphera.net:8443',
    'staging.ciphera.net',
    '',
  ]

  const NOINDEX = 'noindex, nofollow'
  const BLANKET_DISALLOW = 'User-agent: *\nDisallow: /\n'

  describe.each(STAGING_HOSTS)('on %s', (host) => {
    it('answers /robots.txt with a blanket Disallow', async () => {
      const res = middleware(createRequest('/robots.txt', {}, host))
      expect(await res.text()).toBe(BLANKET_DISALLOW)
      expect(res.headers.get('content-type')).toContain('text/plain')
    })

    it('tags a public page noindex', () => {
      expect(middleware(createRequest('/login', {}, host)).headers.get('X-Robots-Tag')).toBe(NOINDEX)
    })

    it('tags a redirect to the sign-in page noindex', () => {
      const res = middleware(createRequest('/sites', {}, host))
      expect(res.headers.get('Location')).toContain('/login')
      expect(res.headers.get('X-Robots-Tag')).toBe(NOINDEX)
    })

    it('tags a signed-in redirect noindex', () => {
      const home = middleware(createRequest('/', { pulse_access: 'tok' }, host))
      expect(home.headers.get('Location')).not.toBeNull()
      expect(home.headers.get('X-Robots-Tag')).toBe(NOINDEX)
      const login = middleware(createRequest('/login', { pulse_access: 'tok' }, host))
      expect(login.headers.get('Location')).not.toBeNull()
      expect(login.headers.get('X-Robots-Tag')).toBe(NOINDEX)
    })

    it('tags a signed-in page noindex', () => {
      expect(middleware(createRequest('/sites', { pulse_access: 'tok' }, host)).headers.get('X-Robots-Tag')).toBe(NOINDEX)
    })
  })

  describe.each(NOT_STAGING)('on %j', (host) => {
    it('does not answer /robots.txt itself', async () => {
      const res = middleware(createRequest('/robots.txt', {}, host))
      expect(await res.text()).not.toContain('Disallow')
      expect(res.headers.get('X-Robots-Tag')).toBeNull()
    })

    it('adds no X-Robots-Tag to a public page, a redirect or a signed-in page', () => {
      for (const [path, cookies] of [
        ['/login', {}],
        ['/demo/pages', {}],
        ['/sites', {}],
        ['/', { pulse_access: 'tok' }],
        ['/login', { pulse_access: 'tok' }],
        ['/sites', { pulse_access: 'tok' }],
      ] as [string, Record<string, string>][]) {
        const res = middleware(createRequest(path, cookies, host))
        expect(res.headers.get('X-Robots-Tag'), `${host} ${path}`).toBeNull()
      }
    })
  })

  it('adds no X-Robots-Tag when the request carries no Host header at all', () => {
    expect(middleware(createRequest('/login')).headers.get('X-Robots-Tag')).toBeNull()
    expect(middleware(createRequest('/sites')).headers.get('X-Robots-Tag')).toBeNull()
  })

  // * The controls: every check above is only worth something if it can come out the other way.
  it('control: the same request is tagged under a staging host and untagged under a production one', () => {
    const staging = middleware(createRequest('/login', {}, STAGING_HOSTS[0])).headers.get('X-Robots-Tag')
    const production = middleware(createRequest('/login', {}, 'pulse.ciphera.net')).headers.get('X-Robots-Tag')
    expect(staging).toBe(NOINDEX)
    expect(production).toBeNull()
  })

  it('control: no host is in both lists', () => {
    expect(NOT_STAGING.filter((h) => STAGING_HOSTS.includes(h))).toEqual([])
  })
})
