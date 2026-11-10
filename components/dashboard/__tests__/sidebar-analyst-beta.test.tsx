// The Analyst row (PUL-78) is a beta behind the barry flag: the member sidebar lists it, with its Beta tag, only while
// the active team's flag is on, and never while /me is still loading (useFeature is null), so it cannot flash. The
// public sidebar never lists it: it has no shareable page.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// --- Mocks (the harness of sidebar-settings-active.test.tsx) --------------

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

vi.mock('@/lib/auth/permissions', () => ({ useCan: () => true }))
let collapsed = false
vi.mock('@/lib/sidebar-context', () => ({ useSidebar: () => ({ collapsed, toggle: vi.fn() }) }))
vi.mock('@/components/sites/SiteFavicon', () => ({ SiteFavicon: () => null }))
vi.mock('@/lib/hooks/useTeamState', () => ({ useTeamState: () => 'team' }))
vi.mock('@/components/support/HelpSupportButton', () => ({ HelpSupportButton: () => null }))

// The team's betas: null until /me answers.
let barry: boolean | null = true
vi.mock('@/lib/features', () => ({ useFeature: (flag: string) => (flag === 'barry' ? barry : false) }))

// See panel-footer-save.test.tsx: a bare `get: () => () => null` proxy MODULE hangs vitest (`then`).
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
      if (prop === 'Tooltip') {
        const Tooltip = ({ children }: any) => <>{children}</>
        Tooltip.displayName = 'Tooltip'
        return Tooltip
      }
      // The Beta tag is Facet's brand Badge: keep its text and variant visible to the test.
      if (prop === 'Badge') {
        const Badge = ({ children, variant }: any) => <span data-testid="nav-badge" data-variant={variant}>{children}</span>
        Badge.displayName = 'Badge'
        return Badge
      }
      return () => null
    },
    has: () => true,
  }),
)

import Sidebar from '../Sidebar'
import { NAV_GROUPS, publicNavGroups } from '../siteNav'
import { SITE_PAGES } from '@/lib/scope/SiteScope'

function renderSidebar() {
  return render(
    <Sidebar siteId="s1" mobileOpen={false} onMobileClose={() => {}} onMobileOpen={() => {}} onOpenPalette={() => {}} />,
  )
}

const analystLink = () => screen.queryByRole('link', { name: /Analyst/ })

beforeEach(() => {
  pathname = '/sites/s1'
  collapsed = false
  barry = true
})

describe('the Analyst row', () => {
  it("is listed with its Beta tag while the team's barry flag is on", () => {
    renderSidebar()
    const link = analystLink()
    expect(link).not.toBeNull()
    expect(link!.getAttribute('href')).toBe('/sites/s1/analyst')
    const badge = link!.querySelector('[data-testid="nav-badge"]')
    expect(badge?.textContent).toBe('Beta')
    expect(badge?.getAttribute('data-variant')).toBe('brand')
  })

  it('is the only row with a tag', () => {
    renderSidebar()
    expect(screen.getAllByTestId('nav-badge')).toHaveLength(1)
  })

  it('is not listed while the flag is off', () => {
    barry = false
    renderSidebar()
    expect(analystLink()).toBeNull()
    expect(screen.queryByTestId('nav-badge')).toBeNull()
    // The rest of the group is untouched.
    expect(screen.getByRole('link', { name: /Search/ })).toBeInTheDocument()
  })

  it('is not listed before /me has answered, so it never flashes', () => {
    barry = null
    renderSidebar()
    expect(analystLink()).toBeNull()
  })

  it('lights up on its page and on anything under it', () => {
    pathname = '/sites/s1/analyst'
    renderSidebar()
    expect(analystLink()!.hasAttribute('data-sidebar-active')).toBe(true)
  })

  it('drops the tag in the collapsed rail, where only the icon shows', () => {
    collapsed = true
    renderSidebar()
    expect(analystLink()).not.toBeNull()
    expect(screen.queryByTestId('nav-badge')).toBeNull()
  })

  it('is never in the public sidebar: it has no shareable page', () => {
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.label === 'Analyst')
    expect(item).toMatchObject({ flag: 'barry', badge: 'Beta' })
    expect(item?.page).toBeUndefined()
    const listed = publicNavGroups(SITE_PAGES).flatMap((g) => g.items.map((i) => i.label))
    expect(listed).not.toContain('Analyst')
  })
})
