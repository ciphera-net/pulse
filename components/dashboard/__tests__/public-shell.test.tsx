// The dashboard shell in public mode (PUL-34 Phase 2): what /demo and /share/<id> wear.
//
// The same shell as the product's, with the account taken out: the rail lists the pages the
// scope shares and nothing else, the bars carry no account, onboarding, site switcher or sites
// list, no palette or shortcut is mounted (every destination they offer is a member route), and
// the demo, and only the demo, says its numbers are a sample and offers the way into the
// product. Neither shell has a notification bell since 20-10-2026 (notifications are
// email-only). Member-only components are markers or call counters here, so the absence
// assertions have something to fail on, and a control renders the member shell.
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

// --- Mocks ---------------------------------------------------------------

let pathname = '/demo'
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={href} {...rest}>{children}</a>,
}))
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy({}, { get: () => ({ children }: { children: React.ReactNode }) => <div>{children}</div> }),
}))
vi.mock('@phosphor-icons/react', () =>
  new Proxy({}, { get: (_t, prop) => (prop === 'then' ? undefined : () => null), has: () => true }),
)
vi.mock('@ciphera-net/facet', () =>
  new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'then') return undefined
      if (prop === 'Tooltip') {
        const Tooltip = ({ children }: { children: React.ReactNode }) => <>{children}</>
        Tooltip.displayName = 'Tooltip'
        return Tooltip
      }
      if (prop === 'cn') return (...c: unknown[]) => c.filter(Boolean).join(' ')
      if (prop === 'buttonVariants') return () => 'button'
      return () => null
    },
    has: () => true,
  }),
)
vi.mock('@ciphera-net/facet-avatar', () => ({ Avatar: () => null, personAvatarSeed: () => 'seed' }))

// Everything that belongs to the account: each is a counter or a marker.
const calls = vi.hoisted(() => ({ auth: 0, teamProps: 0, teamState: 0, sites: 0, can: 0 }))
vi.mock('@/lib/auth/context', () => ({
  useAuth: () => {
    calls.auth += 1
    return { user: { id: 'u1', email: 'someone@example.com' }, loading: false, vaultState: 'open' }
  },
}))
vi.mock('@/components/dashboard/userMenuTeam', () => ({ useUserMenuTeamProps: () => { calls.teamProps += 1; return {} } }))
vi.mock('@/lib/hooks/useTeamState', () => ({ useTeamState: () => { calls.teamState += 1; return 'team' } }))
vi.mock('@/lib/swr/sites', () => ({
  useSites: () => { calls.sites += 1; return { sites: [{ id: 's1', name: 'Mine', domain: 'mine.example' }], isLoading: false, error: undefined, mutate: vi.fn() } },
  FaviconPreloader: () => null,
}))
vi.mock('@/lib/auth/permissions', () => ({ useCan: () => { calls.can += 1; return true } }))
vi.mock('@/components/onboarding/OnboardingChip', () => ({ default: () => <div data-testid="onboarding" /> }))
vi.mock('@/components/account/UnnamedSession', () => ({ UnnamedSession: () => null }))
vi.mock('@/components/theme/ThemeMenuSwitch', () => ({ default: () => null }))
vi.mock('@/components/settings/nav', () => ({ navGroups: () => [], tabFor: () => null }))
vi.mock('@/components/support/HelpSupportButton', () => ({ HelpSupportButton: () => <div data-testid="help" /> }))
vi.mock('@/components/keyboard/ShortcutHandler', () => ({ ShortcutHandler: () => <div data-testid="shortcuts" /> }))
vi.mock('@/components/keyboard/ShortcutsOverlay', () => ({ ShortcutsOverlay: () => <div data-testid="shortcuts-overlay" /> }))
vi.mock('@/components/command/CommandPalette', () => ({ CommandPalette: () => <div data-testid="palette" /> }))

// What the public bars read: the site and the funnel, by the shared hooks.
let site: { id: string; name: string; domain: string } | undefined
let funnel: { name: string } | undefined
vi.mock('@/lib/swr/dashboard', () => ({
  useSite: (id: string) => ({ data: id ? site : undefined }),
  useFunnelDetail: (_siteId: string, funnelId: string) => ({ data: funnelId ? funnel : undefined }),
}))
// The real hook names a share link from the dashboard payload (lib/swr/__tests__/site-read.behavior.test.tsx).
vi.mock('@/lib/swr/public-site-identity', () => ({
  usePublicSiteIdentity: (id: string) => (id && site ? { name: site.name, domain: site.domain } : undefined),
}))
vi.mock('@/components/sites/SiteFavicon', () => ({
  SiteFavicon: ({ domain }: { domain: string }) => <i data-testid="favicon" data-domain={domain} />,
}))

const postEmbedReady = vi.fn()
vi.mock('@/lib/scope/embed', () => ({ postEmbedReady: () => postEmbedReady() }))

import DashboardShell from '../DashboardShell'
import { SITE_PAGES, SiteScopeProvider, memberScope, type SiteScope } from '@/lib/scope/SiteScope'
import { useLiveIndicator } from '@/lib/live-indicator-context'

const demoScope = (overrides: Partial<SiteScope> = {}): SiteScope => ({
  siteId: 'halden', mode: 'public', basePath: '/demo', pages: SITE_PAGES, demo: true, fidelity: 'full', ...overrides,
})
const customerScope = (overrides: Partial<SiteScope> = {}): SiteScope =>
  demoScope({ siteId: 'site-9', basePath: '/share/site-9', pages: ['dashboard'], demo: false, fidelity: 'scoped', ...overrides })

function MarkUpdated() {
  const { markUpdated } = useLiveIndicator()
  React.useEffect(() => { markUpdated() }, [markUpdated])
  return null
}

function renderPublic(scope: SiteScope, path: string, child: React.ReactNode = <div data-testid="content" />) {
  pathname = path
  return render(
    <SiteScopeProvider scope={scope}>
      <DashboardShell siteId={scope.siteId}>{child}</DashboardShell>
    </SiteScopeProvider>,
  )
}

/** The desktop rail's links (the first <aside>; the drawer is a second one, only while open). */
async function railLinks(): Promise<HTMLAnchorElement[]> {
  await screen.findByRole('link', { name: 'Dashboard' })
  const rail = document.querySelector('aside') as HTMLElement
  return within(rail).getAllByRole('link') as HTMLAnchorElement[]
}
const labelsOf = (links: HTMLAnchorElement[]) => links.map((a) => a.textContent?.trim())

beforeEach(() => {
  pathname = '/demo'
  calls.auth = calls.teamProps = calls.teamState = calls.sites = calls.can = 0
  site = { id: 'halden', name: 'Halden Cycles', domain: 'haldencycles.example' }
  funnel = { name: 'Bike purchase' }
  postEmbedReady.mockReset()
  localStorage.clear()
})

describe('the sidebar in public mode', () => {
  it('lists the member rail\'s pages, in its order and groups, linked under the demo', async () => {
    // Expanded: a collapsed rail draws a hairline where the group heading goes.
    localStorage.setItem('pulse_sidebar_collapsed', 'false')
    renderPublic(demoScope(), '/demo')
    const links = await railLinks()

    expect(labelsOf(links)).toEqual(['Pulse', 'Dashboard', 'Pages', 'Journeys', 'Funnels', 'Search', 'CDN', 'Uptime', 'Performance'])
    expect(links.slice(1).map((a) => a.getAttribute('href'))).toEqual([
      '/demo', '/demo/pages', '/demo/journeys', '/demo/funnels', '/demo/search', '/demo/cdn', '/demo/uptime', '/demo/performance',
    ])
    // The group headings of the member rail, with the same words.
    expect(screen.getByText('Analytics')).toBeInTheDocument()
    expect(screen.getByText('Infrastructure')).toBeInTheDocument()
  })

  it('lists only the pages the scope shares, and drops a group with none', async () => {
    localStorage.setItem('pulse_sidebar_collapsed', 'false')
    renderPublic(customerScope({ pages: ['dashboard', 'funnels'] }), '/share/site-9')
    const links = await railLinks()
    expect(labelsOf(links)).toEqual(['Pulse', 'Dashboard', 'Funnels'])
    expect(links.slice(1).map((a) => a.getAttribute('href'))).toEqual(['/share/site-9', '/share/site-9/funnels'])
    expect(screen.queryByText('Infrastructure')).toBeNull()
  })

  it('never offers what is member-only', async () => {
    renderPublic(demoScope(), '/demo')
    await railLinks()
    for (const text of ['Visitors', 'Site Settings', 'Settings', 'Your Sites', 'Add New Site', 'Integrations', 'Pricing', 'Documentation', 'Help & Support']) {
      expect(screen.queryByText(text), text).toBeNull()
    }
    expect(screen.queryByRole('button', { name: 'Search' })).toBeNull()
    expect(screen.queryByTestId('help')).toBeNull()
    // No link anywhere leads to a member route.
    for (const a of Array.from(document.querySelectorAll('a'))) {
      const href = a.getAttribute('href') ?? ''
      expect(href, href).not.toMatch(/^\/(sites|settings|notifications|integrations|pricing)(\/|$|\?)/)
    }
  })

  it('shows no key hints on its links', async () => {
    renderPublic(demoScope(), '/demo')
    await railLinks()
    expect(document.querySelector('kbd')).toBeNull()
  })

  it('sends the logo out of the page, to the marketing site, in the top window', async () => {
    renderPublic(demoScope(), '/demo')
    const logo = (await railLinks())[0]
    expect(logo).toHaveAttribute('href', 'https://pulse.ciphera.net')
    expect(logo).toHaveAttribute('target', '_top')
  })

  it('does the same on a customer\'s link', async () => {
    renderPublic(customerScope(), '/share/site-9')
    const logo = (await railLinks())[0]
    expect(logo).toHaveAttribute('href', 'https://pulse.ciphera.net')
    expect(logo).toHaveAttribute('target', '_top')
  })

  it('marks the page you are on: the dashboard exactly, the rest and what is under them', async () => {
    const active = async () => (await railLinks()).filter((a) => a.hasAttribute('data-sidebar-active')).map((a) => a.textContent?.trim())

    const scope = demoScope()
    // A new element each time: React skips an element it has already rendered.
    const tree = () => (
      <SiteScopeProvider scope={scope}>
        <DashboardShell siteId={scope.siteId}><div data-testid="content" /></DashboardShell>
      </SiteScopeProvider>
    )
    pathname = '/demo'
    const view = render(tree())
    expect(await active()).toEqual(['Dashboard'])

    pathname = '/demo/pages'
    view.rerender(tree())
    await waitFor(async () => expect(await active()).toEqual(['Pages']))

    pathname = '/demo/funnels/f-1'
    view.rerender(tree())
    await waitFor(async () => expect(await active()).toEqual(['Funnels']))
  })

  it('opens the same navigation in the phone drawer', async () => {
    renderPublic(demoScope(), '/demo')
    await railLinks()
    fireEvent.click(screen.getAllByRole('button', { name: 'Open navigation' })[0])

    const drawer = (await screen.findByText('Navigation')).closest('aside') as HTMLElement
    expect(labelsOf(within(drawer).getAllByRole('link') as HTMLAnchorElement[])).toEqual([
      'Pulse', 'Dashboard', 'Pages', 'Journeys', 'Funnels', 'Search', 'CDN', 'Uptime', 'Performance',
    ])
    expect(within(drawer).queryByRole('button', { name: 'Search' })).toBeNull()
  })

  it('collapses and expands, and remembers it', async () => {
    renderPublic(demoScope(), '/demo')
    await railLinks()
    // Collapsed until somebody says otherwise: the member shell's own default.
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }))
    expect(localStorage.getItem('pulse_sidebar_collapsed')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(localStorage.getItem('pulse_sidebar_collapsed')).toBe('true')
  })
})

describe('the bars in public mode', () => {
  it('reads no account: no auth, team, sites list or permission, and shows no menu or onboarding', async () => {
    renderPublic(demoScope(), '/demo')
    await railLinks()
    expect(calls).toEqual({ auth: 0, teamProps: 0, teamState: 0, sites: 0, can: 0 })
    expect(screen.queryByTestId('onboarding')).toBeNull()
    expect(screen.queryByText('Your Sites')).toBeNull()
  })

  it('mounts neither the palette nor the shortcuts nor their overlay', async () => {
    renderPublic(demoScope(), '/demo')
    await railLinks()
    for (const id of ['palette', 'shortcuts', 'shortcuts-overlay']) expect(screen.queryByTestId(id), id).toBeNull()
  })

  it("names the site as the member bar does: its favicon and name, no switcher", async () => {
    renderPublic(demoScope(), '/demo')
    await railLinks()
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByText('Halden Cycles')).toBeInTheDocument()
    expect(screen.getAllByTestId('favicon')[0]).toHaveAttribute('data-domain', 'haldencycles.example')
    // The phone header names it too.
    expect(screen.getAllByText('Halden Cycles')).toHaveLength(2)
    expect(screen.queryByPlaceholderText('Search sites...')).toBeNull()
    expect(document.querySelector('[data-tour="site-switcher"]')).toBeNull()
  })

  it('shows no name while the site has none to give', async () => {
    site = undefined
    renderPublic(demoScope(), '/demo')
    await railLinks()
    expect(screen.queryByText('Halden Cycles')).toBeNull()
    expect(screen.queryByTestId('favicon')).toBeNull()
  })

  it('crumbs the page by the name the sidebar gives it', async () => {
    renderPublic(demoScope(), '/demo/performance')
    await railLinks()
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByText('Performance')).toBeInTheDocument()
    expect(within(nav).getByText('Pulse')).toBeInTheDocument()
  })

  it('crumbs a funnel by its name, under a link to the funnels', async () => {
    renderPublic(demoScope(), '/demo/funnels/f-1')
    await railLinks()
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).getByText('Bike purchase')).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Funnels' })).toHaveAttribute('href', '/demo/funnels')
  })

  it('has no page crumb for a page the link does not share, nor a parent link to one', async () => {
    renderPublic(customerScope(), '/share/site-9/funnels/f-1')
    await railLinks()
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).queryByText('Funnels')).toBeNull()
    expect(within(nav).queryByText('Bike purchase')).toBeNull()
    expect(within(nav).queryByRole('link')).toBeNull()
  })

  it('has no page crumb for an address that is no page', async () => {
    renderPublic(demoScope(), '/demo/visitors')
    await railLinks()
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(nav).queryByText('Visitors')).toBeNull()
    expect(within(nav).queryByText('Dashboard')).toBeNull()
  })

  it('says when the page last refreshed, once the dashboard has read something', async () => {
    renderPublic(demoScope(), '/demo', <MarkUpdated />)
    await railLinks()
    await waitFor(() => expect(screen.getByText(/Updated|just now|ago/i)).toBeInTheDocument())
  })
})

describe('the demo, and only the demo', () => {
  it('says "Live demo" in the top bar and on the phone, at every width', async () => {
    renderPublic(demoScope(), '/demo/uptime')
    await railLinks()
    // One in the desktop bar, one in the phone's header: the CSS decides which is on screen.
    expect(screen.getAllByText('Live demo')).toHaveLength(2)
    for (const el of screen.getAllByText('Live demo')) expect(el.closest('span')?.querySelector('span[aria-hidden="true"]')).not.toBeNull()
  })

  it('offers "Try Pulse free" to /signup, in the top window, in both bars', async () => {
    renderPublic(demoScope(), '/demo')
    await railLinks()
    const buttons = screen.getAllByRole('link', { name: 'Try Pulse free' })
    expect(buttons).toHaveLength(2)
    for (const a of buttons) {
      expect(a).toHaveAttribute('href', '/signup')
      expect(a).toHaveAttribute('target', '_top')
    }
  })

  it('says nothing of the kind on a customer\'s link', async () => {
    renderPublic(customerScope(), '/share/site-9')
    await railLinks()
    expect(screen.queryByText('Live demo')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Try Pulse free' })).toBeNull()
  })

  it('says it on every page of the demo', async () => {
    // One shell, the address changing under it, as it does when somebody navigates.
    const scope = demoScope()
    const tree = () => (
      <SiteScopeProvider scope={scope}>
        <DashboardShell siteId={scope.siteId}><div data-testid="content" /></DashboardShell>
      </SiteScopeProvider>
    )
    pathname = '/demo'
    const view = render(tree())
    await railLinks()
    const pages: [string, string][] = [
      ['/demo', 'Dashboard'], ['/demo/pages', 'Pages'], ['/demo/journeys', 'Journeys'], ['/demo/funnels', 'Funnels'],
      ['/demo/funnels/f-1', 'Bike purchase'], ['/demo/search', 'Search'], ['/demo/cdn', 'CDN'], ['/demo/uptime', 'Uptime'],
      ['/demo/performance', 'Performance'], ['/demo/nonsense', 'Halden Cycles'],
    ]
    for (const [path, crumbEnd] of pages) {
      pathname = path
      view.rerender(tree())
      // The crumb follows the address, so the bar has really been drawn again for this one.
      expect(screen.getByRole('navigation', { name: 'Breadcrumb' }).textContent, path).toMatch(new RegExp(`${crumbEnd}$`))
      expect(screen.getAllByText('Live demo'), path).toHaveLength(2)
      expect(screen.getAllByRole('link', { name: 'Try Pulse free' }), path).toHaveLength(2)
    }
  })
})

describe('telling the page that frames the demo', () => {
  it('sends the ready message once the dashboard has drawn, and not before', async () => {
    renderPublic(demoScope(), '/demo')
    await railLinks()
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect(postEmbedReady).not.toHaveBeenCalled()
  })

  it('sends it exactly once, after the first read lands', async () => {
    renderPublic(demoScope(), '/demo', <MarkUpdated />)
    await waitFor(() => expect(postEmbedReady).toHaveBeenCalledTimes(1))
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect(postEmbedReady).toHaveBeenCalledTimes(1)
  })
})

// The control: the same shell without a public scope is the member shell, with everything above.
// If these stopped holding, the absence assertions above would be asserting nothing.
describe('control: the member shell', () => {
  function renderMember() {
    pathname = '/sites/s1'
    return render(
      <SiteScopeProvider scope={memberScope('s1')}>
        <DashboardShell siteId="s1"><div data-testid="content" /></DashboardShell>
      </SiteScopeProvider>,
    )
  }

  it('mounts the account, the palette and the shortcuts, and lists Visitors and Site Settings', async () => {
    renderMember()
    await screen.findByRole('link', { name: 'Visitors' })
    expect(calls.auth).toBeGreaterThan(0)
    expect(calls.sites).toBeGreaterThan(0)
    expect(calls.can).toBeGreaterThan(0)
    for (const id of ['palette', 'shortcuts', 'shortcuts-overlay', 'onboarding']) {
      expect(screen.getAllByTestId(id).length, id).toBeGreaterThan(0)
    }
    expect(screen.getByRole('link', { name: 'Site Settings' })).toBeInTheDocument()
    expect(screen.queryByText('Live demo')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Try Pulse free' })).toBeNull()
  })

  it('also renders without any scope at all', async () => {
    pathname = '/sites/s1'
    render(<DashboardShell siteId="s1"><div data-testid="content" /></DashboardShell>)
    await screen.findByRole('link', { name: 'Visitors' })
    expect(screen.getByTestId('content')).toBeInTheDocument()
  })
})
