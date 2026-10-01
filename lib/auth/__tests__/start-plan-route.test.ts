import { describe, it, expect } from 'vitest'
import { isStandaloneRoute, isAuthedAppRoute } from '@/lib/auth/appRoutes'

// /start/plan (D43, the marketing-app split): the dashboard address a future
// marketing /pricing page's plan buttons will link to. It is reachable signed
// out (middleware.ts's PUBLIC_ROUTES), so it must render standalone — no
// dashboard shell, no marketing header flash — for every visitor.
describe('/start/plan routing', () => {
  it('renders standalone (no shell, no marketing chrome), like /setup, /switch and /connect', () => {
    for (const p of ['/start/plan', '/start/plan/', '/setup', '/switch', '/connect']) {
      expect(isStandaloneRoute(p), p).toBe(true)
    }
  })

  // 🔴 The mutation this guards: a bare `startsWith('/start')` instead of
  // `startsWith('/start/')` would also swallow /startups and /startups/claim —
  // ordinary marketing pages that must keep their header and footer.
  it('does NOT swallow /startups — only the /start/ family, with its trailing slash', () => {
    for (const p of ['/startups', '/startups/claim', '/', '/pricing', '/sites']) {
      expect(isStandaloneRoute(p), p).toBe(false)
    }
  })

  it('is not an authed app route: a signed-out visitor must reach it, not the sign-in takeover', () => {
    expect(isAuthedAppRoute('/start/plan')).toBe(false)
  })
})
