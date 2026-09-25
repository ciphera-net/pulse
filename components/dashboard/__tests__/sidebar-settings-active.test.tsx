// The outer sidebar's settings entry, in both of its modes.
//
// Two bugs are pinned here, and both were invisible to every other test:
//
//  1. Site mode's Settings entry could NEVER light up. Its href carries
//     ?siteId= so the destination knows which site to configure, and the active
//     rule matched the pathname against that href — but usePathname() has no
//     query, so the comparison was false on every tab of every site.
//  2. Home mode had no site-settings entry at all and its one settings link
//     pointed at the org's General tab with an EXACT match, so it lit on that
//     single page and went dark on the other eleven settings screens.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// --- Mocks ---------------------------------------------------------------

let pathname = '/sites/s1'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const sites = [{ id: 's1', name: 'Example', domain: 'example.com' }]
vi.mock('@/lib/swr/sites', () => ({
  useSites: () => ({ sites, isLoading: false, error: undefined, mutate: vi.fn() }),
  FaviconPreloader: () => null,
}))

let canEdit = true
vi.mock('@/lib/auth/permissions', () => ({ useCan: () => canEdit }))
vi.mock('@/lib/sidebar-context', () => ({ useSidebar: () => ({ collapsed: false, toggle: vi.fn() }) }))
vi.mock('@/components/sites/SiteFavicon', () => ({ SiteFavicon: () => null }))
// The home group's heading follows the ONE team-state signal (PULSE-59).
let teamState: 'alone' | 'team' | null = 'team'
vi.mock('@/lib/hooks/useTeamState', () => ({ useTeamState: () => teamState }))
vi.mock('@/components/support/HelpSupportButton', () => ({ HelpSupportButton: () => null }))

// See panel-footer-save.test.tsx: a bare `get: () => () => null` proxy MODULE
// hangs vitest, because the namespace object's `then` becomes a function and the
// dynamic import treats it as a never-resolving thenable.
vi.mock('@phosphor-icons/react', () =>
  new Proxy({}, {
    get: (_t, prop) => (prop === 'then' ? undefined : () => null),
    has: () => true,
  }),
)
vi.mock('@ciphera-net/facet', () =>
  new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'then') return undefined
      // Collapsed rails wrap each link in a Tooltip; it must pass children
      // through or the links vanish from the tree.
      if (prop === 'Tooltip') {
        const Tooltip = ({ children }: any) => <>{children}</>
        Tooltip.displayName = 'Tooltip'
        return Tooltip
      }
      return () => null
    },
    has: () => true,
  }),
)

import Sidebar from '../Sidebar'

function renderSidebar(siteId: string | null) {
  return render(
    <Sidebar
      siteId={siteId}
      mobileOpen={false}
      onMobileClose={() => {}}
      onMobileOpen={() => {}}
      onOpenPalette={() => {}}
    />,
  )
}

/** The desktop rail is `hidden md:flex`; jsdom has no CSS, so it is in the tree. */
const link = (name: RegExp) => screen.getByRole('link', { name })
const isActive = (el: HTMLElement) => el.hasAttribute('data-sidebar-active')

beforeEach(() => {
  canEdit = true
  pathname = '/sites/s1'
})

describe('the sidebar settings entry — site mode', () => {
  it('is active on a settings tab, and still carries the site in its href', () => {
    pathname = '/settings/site/goals'
    renderSidebar('s1')

    const settings = link(/Site Settings/)
    expect(isActive(settings)).toBe(true)
    // The query is how ActiveSiteProvider learns which site to configure — it
    // must survive the match fix, not be dropped to make matching easy.
    expect(settings.getAttribute('href')).toBe('/settings/site/general?siteId=s1')
  })

  it('is NOT active on a site page, where another entry owns the highlight', () => {
    pathname = '/sites/s1/journeys'
    renderSidebar('s1')

    expect(isActive(link(/Site Settings/))).toBe(false)
    expect(isActive(link(/Journeys/))).toBe(true)
  })
})

describe('the sidebar settings entry — home mode', () => {
  it('is active on an account tab', () => {
    pathname = '/settings/account/security'
    renderSidebar(null)

    const settings = link(/^Settings$/)
    expect(settings.getAttribute('href')).toBe('/settings')
    expect(isActive(settings)).toBe(true)
  })

  it('is active on the settings landing page itself', () => {
    pathname = '/settings'
    renderSidebar(null)
    expect(isActive(link(/^Settings$/))).toBe(true)
  })

  it('is NOT active on the sites home', () => {
    pathname = '/sites'
    renderSidebar(null)
    expect(isActive(link(/^Settings$/))).toBe(false)
  })

  it('no longer offers an Organization-only settings entry', () => {
    pathname = '/settings/organization/members'
    renderSidebar(null)
    // The org's General tab is one of twelve settings screens; the rail links
    // the section, and the settings rail picks the tab.
    expect(screen.queryByRole('link', { name: /Organization Settings/ })).toBeNull()
    expect(isActive(link(/^Settings$/))).toBe(true)
  })
})

describe('home group heading (PULSE-59)', () => {
  it('reads Team for a team, and while the state is not known', () => {
    pathname = '/sites'
    teamState = 'team'
    const { unmount } = renderSidebar(null)
    expect(screen.getAllByText('Team').length).toBeGreaterThan(0)
    expect(screen.queryByText('Organization')).toBeNull()
    unmount()
    teamState = null
    renderSidebar(null)
    expect(screen.getAllByText('Team').length).toBeGreaterThan(0)
  })

  it('reads Account for somebody alone, never team or organization', () => {
    pathname = '/sites'
    teamState = 'alone'
    const { container } = renderSidebar(null)
    expect(screen.getAllByText('Account').length).toBeGreaterThan(0)
    expect(container.textContent).not.toMatch(/team|workspace|organi[sz]ation/i)
    teamState = 'team'
  })
})
