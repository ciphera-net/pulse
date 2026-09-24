import { describe, it, expect } from 'vitest'
import { isStandaloneRoute, isExemptFromOnboardingWall, isAuthedAppRoute } from '@/lib/auth/appRoutes'

// The MCP consent page (/connect, PULSE-41). Its natural first visitor is a
// brand-new account with an empty workspace — exactly who the onboarding wall
// catches — and the wizard has no way back to the request the assistant is
// waiting on. So /connect is exempt from the wall, and it owns its viewport.
describe('/connect routing', () => {
  it('is exempt from the onboarding wall, beside the routes that always were', () => {
    for (const p of ['/connect', '/setup/site', '/settings/organization/api-keys', '/join/abc']) {
      expect(isExemptFromOnboardingWall(p), p).toBe(true)
    }
  })

  it('does not exempt the dashboard, or an absent path', () => {
    for (const p of ['/', '/sites', '/sites/123', '/notifications', null, undefined, '']) {
      expect(isExemptFromOnboardingWall(p as string), String(p)).toBe(false)
    }
  })

  it('renders standalone (no shell, no marketing chrome), like /setup and /join', () => {
    for (const p of ['/connect', '/setup', '/switch', '/join/abc']) expect(isStandaloneRoute(p), p).toBe(true)
    for (const p of ['/', '/pricing', '/sites', '/settings']) expect(isStandaloneRoute(p), p).toBe(false)
  })

  it('is not an authed app route: a dead session there signs in and returns, rather than the takeover', () => {
    expect(isAuthedAppRoute('/connect')).toBe(false)
  })
})
