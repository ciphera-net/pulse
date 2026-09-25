// The settings shell after the 16-09-2026 overhaul (owner pick A6): one header
// line `Scope · Tab`, a scope Switcher above a bordered rail that shows ONE
// scope's rows as icon + label + description, and the primary action portaled
// in beside the title. jsdom cannot see pixels, so these pin the STRUCTURE the
// approved mock was read from — which rows are on screen, which one is
// current, where the switcher sends you — and the staging capture judges the
// rest.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

const push = vi.fn()
let pathname = '/settings/organization/billing'

vi.mock('next/link', () => ({ default: ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a> }))
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push }),
}))
vi.mock('framer-motion', () => import('@/components/settings/__tests__/framer-mock'))
vi.mock('@phosphor-icons/react', () => new Proxy({}, {
  get: (_target, prop) => (prop === 'then' ? undefined : () => null),
  has: () => true,
}))
vi.mock('@/lib/auth/permissions', () => ({ useCan: () => true }))
// The grouping follows the ONE team-state signal (PULSE-59); each test sets it.
let teamState: 'alone' | 'team' | null = 'team'
vi.mock('@/lib/hooks/useTeamState', () => ({ useTeamState: () => teamState }))
// The header's site identity reads the active site from this hook (round 3).
type SiteLike = { id: string; name: string; domain: string }
const setActiveSiteId = vi.fn()
let activeSiteValue: { sites: SiteLike[]; activeSite: SiteLike | null; setActiveSiteId: typeof setActiveSiteId } = {
  sites: [], activeSite: null, setActiveSiteId,
}
vi.mock('@/components/settings/active-site', () => ({ useActiveSite: () => activeSiteValue }))
vi.mock('@/components/sites/SiteFavicon', () => ({ SiteFavicon: ({ name }: any) => <span data-testid="favicon">{name?.[0]}</span> }))
vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: any[]) => a.flat(Infinity).filter(Boolean).join(' '),
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Badge: ({ children }: any) => <span data-badge>{children}</span>,
  // A radiogroup of buttons is all the shell needs from the Switcher here:
  // which option is selected, and what happens when another is picked.
  Switcher: ({ options, value, onChange, 'aria-label': label }: any) => (
    <div role="radiogroup" aria-label={label}>
      {options.map((o: any) => (
        <button key={o.value} role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  ),
}))

import SettingsShell from '@/components/settings/SettingsShell'
import { navGroups } from '@/components/settings/nav'

const ORG = navGroups('team').find((g) => g.section === 'organization')!

beforeEach(() => {
  push.mockReset()
  setActiveSiteId.mockReset()
  pathname = '/settings/organization/billing'
  activeSiteValue = { sites: [], activeSite: null, setActiveSiteId }
  teamState = 'team'
})

describe('SettingsShell (A6)', () => {
  it('titles the page as one line, Scope · Tab, with no eyebrow and no dek', () => {
    render(<SettingsShell><div>tab</div></SettingsShell>)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent(/Team.*Billing/)
    // The old three-line masthead: an uppercase eyebrow, an h1 repeating it,
    // and a lede listing the tabs. None of it survives.
    expect(screen.queryByText('Manage your workspace, team, and billing.')).toBeNull()
    expect(document.querySelector('header .uppercase')).toBeNull()
  })

  it('reads the mobile sheet trigger as "All settings", not a repeat of the header line', () => {
    render(<SettingsShell><div>tab</div></SettingsShell>)
    // jsdom does not apply md:hidden, so the trigger is still in the DOM.
    const trigger = screen.getByRole('button', { name: 'All settings' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    // The h1 above it still carries the Scope · Tab line — only the trigger changes.
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent(/Team.*Billing/)
    expect(trigger).not.toHaveTextContent(' · ')
    expect(trigger).not.toHaveTextContent('Billing')
  })

  it('shows only the active scope in the rail, each row with its description', () => {
    render(<SettingsShell><div>tab</div></SettingsShell>)
    const rail = screen.getByRole('navigation', { name: 'Settings sections' })
    // The rail also carries the two legal links; the rows are the settings hrefs.
    const links = within(rail).getAllByRole('link').filter((l) => (l.getAttribute('href') ?? '').startsWith('/settings'))
    const hrefs = links.map((l) => l.getAttribute('href'))
    // Seven team rows (useCan is true for everything), nothing else.
    expect(hrefs).toEqual(ORG.tabs.map((t) => t.href))
    expect(hrefs.some((h) => h!.startsWith('/settings/site') || h!.startsWith('/settings/account'))).toBe(false)
    // Two lines per row: the label and the registry's description.
    for (const tab of ORG.tabs) {
      expect(within(rail).getByText(tab.description)).toBeInTheDocument()
    }
    // The legal links survive under the rail.
    expect(within(rail).getByRole('link', { name: 'Privacy Policy' })).toBeInTheDocument()
  })

  it('marks the MCP row New in the rail, and no other row (PULSE-54)', () => {
    render(<SettingsShell><div>tab</div></SettingsShell>)
    const rail = screen.getByRole('navigation', { name: 'Settings sections' })
    const mcp = within(rail).getByRole('link', { name: 'Team: MCP' })
    expect(mcp).toHaveAttribute('href', '/settings/organization/mcp')
    expect(mcp.querySelector('[data-badge]')?.textContent).toBe('New')
    expect(rail.querySelectorAll('[data-badge]')).toHaveLength(1)
  })

  it('marks the current tab and no other', () => {
    render(<SettingsShell><div>tab</div></SettingsShell>)
    const rail = screen.getByRole('navigation', { name: 'Settings sections' })
    const current = within(rail).getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveAttribute('href', '/settings/organization/billing')
  })

  it('switches scope to that scope\'s first visible tab', () => {
    render(<SettingsShell><div>tab</div></SettingsShell>)
    const group = screen.getAllByRole('radiogroup', { name: 'Settings scope' })[0]
    expect(within(group).getByRole('radio', { name: 'Team' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(within(group).getByRole('radio', { name: 'Account' }))
    expect(push).toHaveBeenCalledWith('/settings/account/profile')
    fireEvent.click(within(group).getByRole('radio', { name: 'Site' }))
    expect(push).toHaveBeenCalledWith('/settings/site/general')
    // Picking the scope you are already in is not a navigation.
    push.mockReset()
    fireEvent.click(within(group).getByRole('radio', { name: 'Team' }))
    expect(push).not.toHaveBeenCalled()
  })

  it('renders the landing page with a plain title and no rail', () => {
    pathname = '/settings'
    render(<SettingsShell><div>index</div></SettingsShell>)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Settings')
    expect(screen.queryByRole('navigation', { name: 'Settings sections' })).toBeNull()
    expect(screen.queryByRole('radiogroup', { name: 'Settings scope' })).toBeNull()
  })

  it('still names the scope in the header when the tab is unknown (pre-redirect)', () => {
    pathname = '/settings/account/nope'
    render(<SettingsShell><div>tab</div></SettingsShell>)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Account')
    const rail = screen.getByRole('navigation', { name: 'Settings sections' })
    expect(within(rail).getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')).toHaveLength(0)
  })
})

// ─── Round 3 (owner pick 16-09-2026): on a Site tab the header names the site ───
const ACME: SiteLike = { id: 'site-a', name: 'Acme', domain: 'acme.example' }
const BOLT: SiteLike = { id: 'site-b', name: 'Bolt', domain: 'bolt.example' }

describe('SettingsShell — the site named in the header', () => {
  it('names the site in place of the scope word, with a caret that opens the site switcher', () => {
    pathname = '/settings/site/goals'
    activeSiteValue = { sites: [ACME, BOLT], activeSite: ACME, setActiveSiteId }
    render(<SettingsShell><div>tab</div></SettingsShell>)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent(/Acme.*Goals/)
    expect(h1).not.toHaveTextContent(/^Site/)
    // The caret is a real control: it opens a listbox of the sites, and picking
    // one switches the active site.
    const trigger = within(h1).getByRole('button', { name: /Switch site/ })
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox')
    fireEvent.click(trigger)
    const list = screen.getByRole('listbox', { name: 'Sites' })
    expect(within(list).getAllByRole('option')).toHaveLength(2)
    fireEvent.click(within(list).getByRole('option', { name: /Bolt/ }))
    expect(setActiveSiteId).toHaveBeenCalledWith('site-b')
  })

  it('keeps the scope Switcher reading Site: it switches scope, not site', () => {
    pathname = '/settings/site/goals'
    activeSiteValue = { sites: [ACME, BOLT], activeSite: ACME, setActiveSiteId }
    render(<SettingsShell><div>tab</div></SettingsShell>)
    const rail = screen.getByRole('navigation', { name: 'Settings sections' })
    expect(within(rail).getByRole('radio', { name: 'Site' })).toHaveAttribute('aria-checked', 'true')
  })

  it('nothing above the panels names the site any more: the identity card is gone', () => {
    pathname = '/settings/site/goals'
    activeSiteValue = { sites: [ACME, BOLT], activeSite: ACME, setActiveSiteId }
    render(<SettingsShell><div data-testid="tab">tab</div></SettingsShell>)
    // The band showed the domain and a "Switch site" button between the header and the tab.
    expect(screen.queryByText('acme.example')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Switch site' })).toBeNull()
    const tab = screen.getByTestId('tab')
    const h1 = screen.getByRole('heading', { level: 1 })
    // Between the header and the tab's own content sits only the layout: no element carrying the site name.
    const between = Array.from(document.querySelectorAll('main *, body *')).filter(
      (el) => el !== h1 && !h1.contains(el) && !tab.contains(el) && el.children.length === 0 && (el.textContent || '').trim() === 'Acme',
    )
    expect(between).toHaveLength(0)
  })

  it('shows the scope word until the active site resolves', () => {
    pathname = '/settings/site/goals'
    activeSiteValue = { sites: [], activeSite: null, setActiveSiteId }
    render(<SettingsShell><div>tab</div></SettingsShell>)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent(/Site.*Goals/)
    expect(within(h1).queryByRole('button')).toBeNull()
  })

  it('with a single site the name is plain text: nothing to switch to', () => {
    pathname = '/settings/site/general'
    activeSiteValue = { sites: [ACME], activeSite: ACME, setActiveSiteId }
    render(<SettingsShell><div>tab</div></SettingsShell>)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent(/Acme.*General/)
    expect(within(h1).queryByRole('button')).toBeNull()
  })

  it('leaves the other scopes alone: Team · Billing, no site control', () => {
    activeSiteValue = { sites: [ACME, BOLT], activeSite: ACME, setActiveSiteId }
    render(<SettingsShell><div>tab</div></SettingsShell>)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent(/Team.*Billing/)
    expect(h1).not.toHaveTextContent(/Acme/)
    expect(within(h1).queryByRole('button')).toBeNull()
  })
})


// ─── Round two (17-09-2026): the frame, the header line, the rail's rhythm and glide ───
describe('SettingsShell — round two, the frame and the rail', () => {
  it('uses the dashboard\'s container: max-w-7xl, the header near the top, no cap on the content column', () => {
    const { container } = render(<SettingsShell><div>tab</div></SettingsShell>)
    const wrap = container.querySelector('.max-w-7xl') as HTMLElement
    expect(wrap).not.toBeNull()
    expect(wrap.className).toMatch(/\bpt-4\b/)
    expect(wrap.className).not.toMatch(/\bpy-8\b/)
    expect(container.querySelector('.max-w-6xl')).toBeNull()
    // The content column used to stop at max-w-3xl (768px), 208px short of the frame.
    expect(container.querySelector('.max-w-3xl')).toBeNull()
  })

  it('puts the primary action at the far right of the header line', () => {
    const { container } = render(<SettingsShell><div>tab</div></SettingsShell>)
    const h1 = container.querySelector('h1')!
    expect(h1.parentElement!.className).toMatch(/\bjustify-between\b/)
  })

  it('gives every rail row the same height and a hover tint; the rows draw no bar of their own', () => {
    render(<SettingsShell><div>tab</div></SettingsShell>)
    const rail = screen.getByRole('navigation', { name: 'Settings sections' })
    const rows = within(rail).getAllByRole('link').filter((l) => (l.getAttribute('href') ?? '').startsWith('/settings'))
    for (const row of rows) {
      expect(row.className).toMatch(/\bmin-h-\[76px\]/)
      expect(row.className).toMatch(/hover:bg-/)
      expect(row.querySelector('.w-0\\.5')).toBeNull()
    }
    // One measured bar, owned by the rail, is what moves between rows.
    expect(rail.querySelectorAll('[data-rail-highlight]')).toHaveLength(1)
    expect(within(rail).getAllByRole('link').filter((l) => l.hasAttribute('data-rail-active'))).toHaveLength(1)
  })
  // Settings tail, item 11 (17-09-2026): tabbing through a settings page on
  // staging showed every stop on the house ring except the rail's two legal
  // links, which fell back to the browser's default outline.
  it('gives the rail\'s legal links the house focus ring, not the browser default', () => {
    render(<SettingsShell><div>tab</div></SettingsShell>)
    for (const name of ['Privacy Policy', 'Terms of Service']) {
      const link = screen.getByRole('link', { name })
      expect(link.className).toMatch(/\bfocus-visible:ring-ring\b/)
      expect(link.className).toMatch(/\bfocus-visible:outline-none\b/)
    }
  })

})

// ─── PULSE-59: somebody who works alone sees Site + Account (option B1) ───
describe('SettingsShell — alone (B1)', () => {
  beforeEach(() => { teamState = 'alone' })

  it('reads the scope switcher Site | Account, with no Team scope', () => {
    render(<SettingsShell><div>tab</div></SettingsShell>)
    const group = screen.getAllByRole('radiogroup', { name: 'Settings scope' })[0]
    expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Site', 'Account'])
  })

  it('shows billing under Account, same href, and titles it Account · Billing', () => {
    render(<SettingsShell><div>tab</div></SettingsShell>)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Account.*Billing/)
    const group = screen.getAllByRole('radiogroup', { name: 'Settings scope' })[0]
    expect(within(group).getByRole('radio', { name: 'Account' })).toHaveAttribute('aria-checked', 'true')
    const rail = screen.getByRole('navigation', { name: 'Settings sections' })
    const current = within(rail).getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveAttribute('href', '/settings/organization/billing')
    expect(current[0]).toHaveAccessibleName('Account: Billing')
  })

  it('lists the Account rows, then Billing, API Keys, MCP and Invite people; no team name, roles or audit log', () => {
    render(<SettingsShell><div>tab</div></SettingsShell>)
    const rail = screen.getByRole('navigation', { name: 'Settings sections' })
    const hrefs = within(rail).getAllByRole('link')
      .map((l) => l.getAttribute('href') ?? '')
      .filter((h) => h.startsWith('/settings'))
    expect(hrefs).toEqual([
      '/settings/account/profile',
      '/settings/account/security',
      '/settings/account/devices',
      '/settings/account/notifications',
      '/settings/account/security-alerts',
      '/settings/organization/billing',
      '/settings/organization/api-keys',
      '/settings/organization/mcp',
      '/settings/organization/members',
    ])
    expect(within(rail).getByRole('link', { name: 'Account: Invite people' })).toBeInTheDocument()
    expect(within(rail).getByText('Share your sites with others.')).toBeInTheDocument()
    expect(within(rail).queryByText(/team|workspace|organi[sz]ation/i)).toBeNull()
  })

  it('titles the Members route Account · Invite people', () => {
    pathname = '/settings/organization/members'
    render(<SettingsShell><div>tab</div></SettingsShell>)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Account.*Invite people/)
  })

  it('still renders an unlisted route under Account, named, with no rail row current', () => {
    pathname = '/settings/organization/audit'
    render(<SettingsShell><div data-testid="tab">tab</div></SettingsShell>)
    expect(screen.getByTestId('tab')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Account.*Audit Log/)
    const rail = screen.getByRole('navigation', { name: 'Settings sections' })
    expect(within(rail).getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')).toHaveLength(0)
  })

  it('renders the TEAM layout while the state is not known (null)', () => {
    teamState = null
    render(<SettingsShell><div>tab</div></SettingsShell>)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Team.*Billing/)
    const group = screen.getAllByRole('radiogroup', { name: 'Settings scope' })[0]
    expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Site', 'Team', 'Account'])
  })
})
