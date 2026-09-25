// Where the site identity stops.
//
// The shell is handed a real siteId on /settings/site/* now — that is what keeps
// the outer rail in site mode instead of dumping you back to Your Sites. But the
// rail is the ONLY thing that may act on it there: a settings tab is still a
// settings screen, and the fix is otherwise meant to be invisible.
//
// Three consumers read a site id in this file and each shows something different
// when it is truthy — the breadcrumb (site picker, site name, Live dot), the
// content header, and the command palette, whose "Pages" group and product-tour
// action are gated on nothing but that value. Passing the rail's site to all of
// them would quietly add nine ⌘K destinations to a screen that never offered
// one, so this pins the split rather than trusting the comment on it.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// --- Mocks ---------------------------------------------------------------

let pathname = '/sites/s1'
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}))
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: any) => <>{children}</>,
  motion: new Proxy({}, { get: () => ({ children }: any) => <div>{children}</div> }),
}))

// See panel-footer-save.test.tsx: a bare `get: () => () => null` proxy MODULE
// hangs vitest, because the namespace object's `then` becomes a function and the
// dynamic import treats it as a never-resolving thenable.
// (Inlined twice, not shared: vi.mock is hoisted above every const.)
vi.mock('@phosphor-icons/react', () =>
  new Proxy({}, {
    get: (_t, prop) => (prop === 'then' ? undefined : () => null),
    has: () => true,
  }),
)
vi.mock('@ciphera-net/facet', () =>
  new Proxy({}, {
    get: (_t, prop) => (prop === 'then' ? undefined : () => null),
    has: () => true,
  }),
)

vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'someone@example.com' }, loading: false }),
}))
// The team-state signal (PULSE-59). null, "not known", is what every test
// above ran with before the breadcrumb read it, and it gets the team layout.
let teamState: 'alone' | 'team' | null = null
vi.mock('@/lib/hooks/useTeamState', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/hooks/useTeamState')>()),
  useTeamState: () => teamState,
}))
vi.mock('@/lib/hooks/useOrgSwitcher', () => ({
  useOrgSwitcher: () => ({ orgs: [], activeOrgId: null, switchOrganization: vi.fn(), createOrganization: vi.fn() }),
}))
vi.mock('@/lib/swr/dashboard', () => ({ useFunnelDetail: () => ({ data: null }) }))
vi.mock('@/lib/swr/sites', () => ({
  useSites: () => ({ sites: [{ id: 's1', name: 'Example Site', domain: 'example.com' }], isLoading: false, error: undefined, mutate: vi.fn() }),
}))
vi.mock('@/components/sites/SiteFavicon', () => ({ SiteFavicon: () => null }))
vi.mock('@/components/notifications/NotificationCenter', () => ({ default: () => null }))
vi.mock('@/components/onboarding/OnboardingChip', () => ({ default: () => null }))
vi.mock('@/components/keyboard/ShortcutHandler', () => ({ ShortcutHandler: () => null }))
vi.mock('@/components/keyboard/ShortcutsOverlay', () => ({ ShortcutsOverlay: () => null }))

// The three recorders. Each keeps only the LATEST value it was handed.
const seen: { sidebar?: string | null; header?: string | null; palette?: string | null } = {}
vi.mock('@/components/dashboard/Sidebar', () => ({
  default: ({ siteId }: any) => { seen.sidebar = siteId ?? null; return null },
}))
vi.mock('@/components/dashboard/ContentHeader', () => ({
  default: ({ siteId }: any) => { seen.header = siteId ?? null; return null },
}))
vi.mock('@/components/command/CommandPalette', () => ({
  CommandPalette: ({ currentSiteId }: any) => { seen.palette = currentSiteId ?? null; return null },
}))

// The breadcrumb's own fetch: it must not even be ASKED for a site whose page
// you are not on.
const getSite = vi.fn(async (id: string) => ({ id, name: 'Example Site', domain: 'example.com' }))
vi.mock('@/lib/api/sites', () => ({ getSite: (id: string) => getSite(id) }))

import DashboardShell from '../DashboardShell'

async function renderAt(path: string, siteId: string | null) {
  pathname = path
  render(<DashboardShell siteId={siteId}>{null}</DashboardShell>)
  // The rail is a next/dynamic import; give it a tick to land.
  await waitFor(() => expect(seen.sidebar).not.toBeUndefined())
}

beforeEach(() => {
  teamState = null
  seen.sidebar = undefined
  seen.header = undefined
  seen.palette = undefined
  getSite.mockClear()
})

describe('the dashboard chrome on a site page', () => {
  it('gives every consumer the site', async () => {
    await renderAt('/sites/s1/journeys', 's1')
    expect(seen.sidebar).toBe('s1')
    expect(seen.header).toBe('s1')
    expect(seen.palette).toBe('s1')
    await waitFor(() => expect(screen.getByText('Example Site')).toBeInTheDocument())
  })
})

describe('the dashboard chrome on a site-settings tab', () => {
  it('keeps the rail in site mode and tells nothing else', async () => {
    await renderAt('/settings/site/goals', 's1')
    expect(seen.sidebar).toBe('s1')
    // A settings screen: no site in the header, and no site actions in ⌘K.
    expect(seen.header).toBe(null)
    expect(seen.palette).toBe(null)
    expect(getSite).not.toHaveBeenCalled()
    expect(screen.queryByText('Example Site')).toBeNull()
  })

  it('shows the settings breadcrumb, not the site one', async () => {
    await renderAt('/settings/site/general', 's1')
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.queryByText('Your Sites')).toBeNull()
  })
})

// The breadcrumb names a settings tab the way the rail does (PULSE-59). For
// somebody who works alone the members route is "Invite people" in the rail
// and the page header, so the top bar must not call it "Members" (the approved
// B1 mock reads "Settings › Invite people").
describe('the settings breadcrumb follows the team state', () => {
  it('calls the members route "Invite people" for somebody alone', async () => {
    teamState = 'alone'
    await renderAt('/settings/organization/members', null)
    expect(screen.getByText('Invite people')).toBeInTheDocument()
    expect(screen.queryByText('Members')).toBeNull()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('calls it "Members" in a team', async () => {
    teamState = 'team'
    await renderAt('/settings/organization/members', null)
    expect(screen.getByText('Members')).toBeInTheDocument()
    expect(screen.queryByText('Invite people')).toBeNull()
  })

  it('calls it "Members" while the state is not known, like every other surface', async () => {
    teamState = null
    await renderAt('/settings/organization/members', null)
    expect(screen.getByText('Members')).toBeInTheDocument()
  })

  it('leaves the other tabs named as before', async () => {
    teamState = 'alone'
    await renderAt('/settings/organization/billing', null)
    expect(screen.getByText('Billing')).toBeInTheDocument()
  })
})
