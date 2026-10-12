import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import DashboardChrome from '@/components/dashboard/DashboardChrome'

// PUL-20: inside settings the sidebar keeps the mode that led there. The shell
// is stubbed to record which site it is rendered for.
const nav = vi.hoisted(() => ({ pathname: '/' }))
const active = vi.hoisted(() => ({ activeSiteId: null as string | null }))
const shellSites = vi.hoisted(() => [] as (string | null)[])
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }))
vi.mock('@/components/settings/active-site', () => ({ useActiveSite: () => active }))
vi.mock('@/components/dashboard/DashboardShell', () => ({
  default: ({ siteId, children }: { siteId: string | null; children: React.ReactNode }) => {
    shellSites.push(siteId)
    return <div>{children}</div>
  },
}))

const SITE = 'site-1'
const lastShellSite = () => shellSites[shellSites.length - 1]

function walk(paths: string[]) {
  nav.pathname = paths[0]
  const view = render(<DashboardChrome><span /></DashboardChrome>)
  const seen: (string | null)[] = [lastShellSite()]
  for (const p of paths.slice(1)) {
    nav.pathname = p
    view.rerender(<DashboardChrome><span /></DashboardChrome>)
    seen.push(lastShellSite())
  }
  return seen
}

beforeEach(() => {
  shellSites.length = 0
  active.activeSiteId = SITE
})

describe('DashboardChrome: the sidebar in settings (PUL-20)', () => {
  it('keeps the site you came from across Site, Team and Account settings', () => {
    expect(walk([
      `/sites/${SITE}`,
      '/settings/site/general',
      '/settings/organization/general',
      '/settings/account/profile',
    ])).toEqual([SITE, SITE, SITE, SITE])
  })

  it('a settings page opened fresh (not from a site) keeps the home sidebar', () => {
    expect(walk(['/settings/organization/general', '/settings/account/profile'])).toEqual([null, null])
  })

  it('leaving settings for a home page forgets the site', () => {
    expect(walk([`/sites/${SITE}`, '/sites/new', '/settings/organization/general'])).toEqual([SITE, null, null])
  })

  it('Site settings still follows the active site, wherever you came from', () => {
    expect(walk(['/settings/organization/general', '/settings/site/general', '/settings/organization/members'])).toEqual([null, SITE, SITE])
  })
})
