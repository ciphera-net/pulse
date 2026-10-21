import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import DashboardChrome from '@/components/dashboard/DashboardChrome'
import { SiteScopeProvider, memberScope, type SiteScope } from '@/lib/scope/SiteScope'

// The chrome's hinge under a public scope (PUL-34): the site is the scope's. There is no path
// to read it from, and no account whose active site could differ, so the member hinge's
// ActiveSiteProvider (which the public pages do not mount) must never be asked.
const nav = vi.hoisted(() => ({ pathname: '/demo' }))
const asked = vi.hoisted(() => ({ activeSite: 0 }))
const shellSites = vi.hoisted(() => [] as (string | null)[])
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }))
vi.mock('@/components/settings/active-site', () => ({
  useActiveSite: () => {
    asked.activeSite += 1
    return { activeSiteId: 'member-site' }
  },
}))
vi.mock('@/components/dashboard/DashboardShell', () => ({
  default: ({ siteId, children }: { siteId: string | null; children: React.ReactNode }) => {
    shellSites.push(siteId)
    return <div>{children}</div>
  },
}))

const publicScope: SiteScope = {
  siteId: 'halden', mode: 'public', basePath: '/demo', pages: ['dashboard'], demo: true, fidelity: 'full',
}

beforeEach(() => {
  shellSites.length = 0
  asked.activeSite = 0
})

describe('DashboardChrome under a public scope', () => {
  it("gives the shell the scope's site, at every address under the base path", () => {
    for (const path of ['/demo', '/demo/pages', '/demo/funnels/f-1']) {
      nav.pathname = path
      const view = render(<SiteScopeProvider scope={publicScope}><DashboardChrome><span /></DashboardChrome></SiteScopeProvider>)
      expect(shellSites[shellSites.length - 1], path).toBe('halden')
      view.unmount()
    }
    expect(asked.activeSite).toBe(0)
  })

  it('does the same for a share link', () => {
    nav.pathname = '/share/site-9/pages'
    render(<SiteScopeProvider scope={{ ...publicScope, siteId: 'site-9', basePath: '/share/site-9', demo: false }}><DashboardChrome><span /></DashboardChrome></SiteScopeProvider>)
    expect(shellSites[shellSites.length - 1]).toBe('site-9')
    expect(asked.activeSite).toBe(0)
  })

  // The control: under a member scope, and under none, the hinge is the member one.
  it('control: a member scope reads the site from the path and asks for the active site', () => {
    nav.pathname = '/sites/s1/funnels'
    render(<SiteScopeProvider scope={memberScope('s1')}><DashboardChrome><span /></DashboardChrome></SiteScopeProvider>)
    expect(shellSites[shellSites.length - 1]).toBe('s1')
    expect(asked.activeSite).toBeGreaterThan(0)
  })
})
