import { describe, it, expect } from 'vitest'
import {
  isAuthedAppRoute,
  isExemptFromOnboardingWall,
  isExemptFromWorkspaceProvisioning,
  isPublicSiteRoute,
  isStandaloneRoute,
} from '@/lib/auth/appRoutes'

// /demo (the sample site) and a share link, /share/<id>, with every page under either, are
// public views of one site (PUL-34). The marketing home page frames /demo, so a signed-in
// reader must be shown it exactly as an anonymous one is: no marketing chrome around it, no
// member shell, and above all no redirect into the setup wizard, whose answer
// (X-Frame-Options: DENY) would leave the hero's frame blank.
describe('public site routes', () => {
  it('knows /demo and everything under it, and a share link and everything under it', () => {
    for (const p of ['/demo', '/demo/', '/demo/pages', '/demo/funnels/f1', '/share/abc', '/share/abc/', '/share/abc/pages', '/share/abc/funnels/f1']) {
      expect(isPublicSiteRoute(p), p).toBe(true)
    }
  })

  it('matches whole path segments, never a prefix of a word', () => {
    for (const p of ['/', '/demonstration', '/demos', '/demo-site', '/share', '/share/', '/shared/abc', '/sites/s1/demo', '/settings/demo', '/r/demo']) {
      expect(isPublicSiteRoute(p), p).toBe(false)
    }
    expect(isPublicSiteRoute(null)).toBe(false)
    expect(isPublicSiteRoute(undefined)).toBe(false)
  })

  it('is exempt from the onboarding wall and from background workspace provisioning', () => {
    for (const p of ['/demo', '/demo/pages', '/share/abc', '/share/abc/funnels/f1']) {
      expect(isExemptFromOnboardingWall(p), p).toBe(true)
      expect(isExemptFromWorkspaceProvisioning(p), p).toBe(true)
    }
  })

  // The exemption is for these routes only: the wall still binds everything else.
  it('control: it does not exempt the member pages or a look-alike', () => {
    for (const p of ['/sites', '/sites/s1', '/demonstration', '/share']) {
      expect(isExemptFromOnboardingWall(p), p).toBe(false)
      expect(isExemptFromWorkspaceProvisioning(p), p).toBe(false)
    }
  })

  it('is neither an authed app route (never the session takeover) nor a standalone one', () => {
    for (const p of ['/demo', '/demo/pages', '/share/abc', '/share/abc/pages']) {
      expect(isAuthedAppRoute(p), p).toBe(false)
      expect(isStandaloneRoute(p), p).toBe(false)
    }
  })
})
