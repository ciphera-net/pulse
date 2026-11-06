// The settings shell after the settings overhaul (R1–R4, R41): one header line (the site or "Settings", then the
// page), one bordered rail of ten pages as icon + label + description with no scope switcher, and the primary action
// portaled in beside the title. jsdom cannot see pixels, so these pin the STRUCTURE the approved drawing was read
// from (which rows are on screen, which one is current, what the header names), and the capture checks judge the rest.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

let pathname = '/settings/organization/billing'

vi.mock('next/link', () => ({ default: ({ children, href, ...rest }: any) => <a href={href} {...rest}>{children}</a> }))
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('framer-motion', () => import('@/components/settings/__tests__/framer-mock'))
vi.mock('@phosphor-icons/react', () => new Proxy({}, {
  get: (_target, prop) => (prop === 'then' ? undefined : () => null),
  has: () => true,
}))
// Each test sets what the person may do; an unlisted permission is held.
let can: Record<string, boolean> = {}
vi.mock('@/lib/auth/permissions', () => ({ useCan: (perm: string) => can[perm] ?? true }))
// The header's site identity reads the active site from this hook (round 3, 16-09-2026).
type SiteLike = { id: string; name: string; domain: string }
const setActiveSiteId = vi.fn()
let activeSiteValue: { sites: SiteLike[]; activeSite: SiteLike | null; setActiveSiteId: typeof setActiveSiteId } = {
  sites: [], activeSite: null, setActiveSiteId,
}
vi.mock('@/components/settings/active-site', () => ({ useActiveSite: () => activeSiteValue, useActiveSiteIdIfAny: () => null }))
vi.mock('@/components/sites/SiteFavicon', () => ({ SiteFavicon: ({ name }: any) => <span data-testid="favicon">{name?.[0]}</span> }))
vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: any[]) => a.flat(Infinity).filter(Boolean).join(' '),
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Badge: ({ children }: any) => <span data-badge>{children}</span>,
}))

import SettingsShell from '@/components/settings/SettingsShell'
import { SETTINGS_PAGES } from '@/components/settings/nav'

const MEMBER = { 'sites.edit': false, 'goals.manage': false, 'billing.view': true, 'integrations.manage': false }

function railRows() {
  const rail = screen.getByRole('navigation', { name: 'Settings sections' })
  // The rail also carries the two legal links; the rows are the settings hrefs.
  return within(rail).getAllByRole('link').filter((l) => (l.getAttribute('href') ?? '').startsWith('/settings'))
}

beforeEach(() => {
  setActiveSiteId.mockReset()
  pathname = '/settings/organization/billing'
  activeSiteValue = { sites: [], activeSite: null, setActiveSiteId }
  can = {}
})

describe('SettingsShell: one list of ten pages', () => {
  it('titles a page as one line, Settings · Page, with no eyebrow and no dek', () => {
    render(<SettingsShell><div>page</div></SettingsShell>)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent(/^Settings.*Billing$/)
    expect(document.querySelector('header .uppercase')).toBeNull()
  })

  it('reads the mobile sheet trigger as "All settings", not a repeat of the header line', () => {
    render(<SettingsShell><div>page</div></SettingsShell>)
    // jsdom does not apply md:hidden, so the trigger is still in the DOM.
    const trigger = screen.getByRole('button', { name: 'All settings' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    expect(trigger).not.toHaveTextContent('Billing')
  })

  it('lists all ten pages in the rail, each with its description, and no scope switcher', () => {
    render(<SettingsShell><div>page</div></SettingsShell>)
    expect(railRows().map((l) => l.getAttribute('href'))).toEqual(SETTINGS_PAGES.map((p) => p.href))
    const rail = screen.getByRole('navigation', { name: 'Settings sections' })
    for (const page of SETTINGS_PAGES) {
      expect(within(rail).getByText(page.description)).toBeInTheDocument()
    }
    expect(screen.queryByRole('radiogroup')).toBeNull()
    // The legal links survive under the rail.
    expect(within(rail).getByRole('link', { name: 'Privacy Policy' })).toBeInTheDocument()
  })

  it('names each row by its page', () => {
    render(<SettingsShell><div>page</div></SettingsShell>)
    const rail = screen.getByRole('navigation', { name: 'Settings sections' })
    expect(within(rail).getByRole('link', { name: 'Developers' })).toHaveAttribute('href', '/settings/organization/api-keys')
    expect(within(rail).getByRole('link', { name: 'Notifications' })).toHaveAttribute('href', '/settings/account/notifications')
  })

  it('marks the current page and no other', () => {
    render(<SettingsShell><div>page</div></SettingsShell>)
    const current = railRows().filter((l) => l.getAttribute('aria-current') === 'page')
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveAttribute('href', '/settings/organization/billing')
  })

  it('marks the page a merged route belongs to, and names that page in the header', () => {
    pathname = '/settings/organization/mcp'
    render(<SettingsShell><div>page</div></SettingsShell>)
    const current = railRows().filter((l) => l.getAttribute('aria-current') === 'page')
    expect(current.map((l) => l.getAttribute('href'))).toEqual(['/settings/organization/api-keys'])
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Settings.*Developers/)
  })

  it('shows a member the six pages a member can use', () => {
    can = MEMBER
    render(<SettingsShell><div>page</div></SettingsShell>)
    expect(railRows().map((l) => l.getAttribute('aria-label'))).toEqual(['Sharing', 'Data', 'Team', 'Billing', 'Account', 'Notifications'])
  })

  it('still names a page a member opened by its address, with no row current', () => {
    can = MEMBER
    pathname = '/settings/organization/api-keys'
    render(<SettingsShell><div>page</div></SettingsShell>)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Settings.*Developers/)
    expect(railRows().filter((l) => l.getAttribute('aria-current') === 'page')).toHaveLength(0)
  })

  it('draws no rail where there is no page (/settings, which redirects; an unknown route)', () => {
    for (const path of ['/settings', '/settings/account/nope']) {
      pathname = path
      const { unmount } = render(<SettingsShell><div>index</div></SettingsShell>)
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Settings$/)
      expect(screen.queryByRole('navigation', { name: 'Settings sections' })).toBeNull()
      unmount()
    }
  })
})

// ─── Round 3 (owner pick 16-09-2026): a site page's header names the site ───
const ACME: SiteLike = { id: 'site-a', name: 'Acme', domain: 'acme.example' }
const BOLT: SiteLike = { id: 'site-b', name: 'Bolt', domain: 'bolt.example' }

describe('SettingsShell: the site named in a site page\'s header', () => {
  it('names the site in place of "Settings", with a caret that opens the site switcher', () => {
    pathname = '/settings/site/goals'
    activeSiteValue = { sites: [ACME, BOLT], activeSite: ACME, setActiveSiteId }
    render(<SettingsShell><div>page</div></SettingsShell>)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent(/Acme.*Goals/)
    expect(h1).not.toHaveTextContent(/Settings/)
    const trigger = within(h1).getByRole('button', { name: /Switch site/ })
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox')
    fireEvent.click(trigger)
    const list = screen.getByRole('listbox', { name: 'Sites' })
    expect(within(list).getAllByRole('option')).toHaveLength(2)
    fireEvent.click(within(list).getByRole('option', { name: /Bolt/ }))
    expect(setActiveSiteId).toHaveBeenCalledWith('site-b')
  })

  it('names the site on a merged site route too', () => {
    pathname = '/settings/site/monitoring'
    activeSiteValue = { sites: [ACME], activeSite: ACME, setActiveSiteId }
    render(<SettingsShell><div>page</div></SettingsShell>)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Acme.*General/)
  })

  it('shows "Site" until the active site resolves', () => {
    pathname = '/settings/site/goals'
    render(<SettingsShell><div>page</div></SettingsShell>)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent(/Site.*Goals/)
    expect(within(h1).queryByRole('button')).toBeNull()
  })

  it('with a single site the name is plain text: nothing to switch to', () => {
    pathname = '/settings/site/general'
    activeSiteValue = { sites: [ACME], activeSite: ACME, setActiveSiteId }
    render(<SettingsShell><div>page</div></SettingsShell>)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent(/Acme.*General/)
    expect(within(h1).queryByRole('button')).toBeNull()
  })

  it('leaves the other pages alone: Settings · Billing, no site control', () => {
    activeSiteValue = { sites: [ACME, BOLT], activeSite: ACME, setActiveSiteId }
    render(<SettingsShell><div>page</div></SettingsShell>)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent(/Settings.*Billing/)
    expect(h1).not.toHaveTextContent(/Acme/)
    expect(within(h1).queryByRole('button')).toBeNull()
  })
})

// ─── Round two (17-09-2026): the frame, the header line, the rail's rhythm and glide ───
describe('SettingsShell: the frame and the rail', () => {
  it('uses the dashboard\'s container: max-w-7xl, the header near the top, no cap on the content column', () => {
    const { container } = render(<SettingsShell><div>page</div></SettingsShell>)
    const wrap = container.querySelector('.max-w-7xl') as HTMLElement
    expect(wrap).not.toBeNull()
    expect(wrap.className).toMatch(/\bpt-4\b/)
    expect(wrap.className).not.toMatch(/\bpy-8\b/)
    expect(container.querySelector('.max-w-3xl')).toBeNull()
  })

  it('puts the primary action at the far right of the header line', () => {
    const { container } = render(<SettingsShell><div>page</div></SettingsShell>)
    const h1 = container.querySelector('h1')!
    expect(h1.parentElement!.className).toMatch(/\bjustify-between\b/)
  })

  it('gives every rail row the same height and a hover tint; the rows draw no bar of their own', () => {
    render(<SettingsShell><div>page</div></SettingsShell>)
    const rail = screen.getByRole('navigation', { name: 'Settings sections' })
    for (const row of railRows()) {
      expect(row.className).toMatch(/\bmin-h-\[76px\]/)
      expect(row.className).toMatch(/hover:bg-/)
      expect(row.querySelector('.w-0\\.5')).toBeNull()
    }
    // One measured bar, owned by the rail, is what moves between rows.
    expect(rail.querySelectorAll('[data-rail-highlight]')).toHaveLength(1)
    expect(railRows().filter((l) => l.hasAttribute('data-rail-active'))).toHaveLength(1)
  })

  it('gives the rail\'s legal links the house focus ring, not the browser default', () => {
    render(<SettingsShell><div>page</div></SettingsShell>)
    for (const name of ['Privacy Policy', 'Terms of Service']) {
      const link = screen.getByRole('link', { name })
      expect(link.className).toMatch(/\bfocus-visible:ring-ring\b/)
      expect(link.className).toMatch(/\bfocus-visible:outline-none\b/)
    }
  })

  it('opens the mobile sheet on the same ten rows, the current one marked', () => {
    render(<SettingsShell><div>page</div></SettingsShell>)
    fireEvent.click(screen.getByRole('button', { name: 'All settings' }))
    const sheet = screen.getByRole('dialog', { name: 'Settings sections' })
    const rows = within(sheet).getAllByRole('link').filter((l) => (l.getAttribute('href') ?? '').startsWith('/settings'))
    expect(rows.map((l) => l.getAttribute('href'))).toEqual(SETTINGS_PAGES.map((p) => p.href))
    expect(rows.filter((l) => l.getAttribute('aria-current') === 'page').map((l) => l.getAttribute('href'))).toEqual(['/settings/organization/billing'])
  })
})
