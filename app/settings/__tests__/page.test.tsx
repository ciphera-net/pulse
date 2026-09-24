import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// cn is the only facet surface the panel primitives touch.
vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: unknown[]) => a.filter(Boolean).join(' '),
  // Facet Button; `asChild` hands the classes to its child (a Link), so the
  // rendered element stays an anchor.
  Button: ({ children, asChild, ...props }: any) => (asChild ? children : <button {...props}>{children}</button>),
  Badge: ({ children }: any) => <span data-badge>{children}</span>,
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}))

let mockActiveSite: {
  activeSite: { name: string; domain: string; is_verified?: boolean } | null
  sites: unknown[]
  isLoading: boolean
}
vi.mock('@/components/settings/active-site', () => ({
  useActiveSite: () => mockActiveSite,
}))

let grantedPerms: Set<string>
vi.mock('@/lib/auth/permissions', () => ({
  useCan: (p: string) => grantedPerms.has(p),
}))

import SettingsLandingPage from '../page'

const ALL_PERMS = [
  'sites.edit',
  'goals.manage',
  'integrations.manage',
  'roles.manage',
  'billing.view',
  'notification_settings.manage',
  'audit.view',
]

beforeEach(() => {
  grantedPerms = new Set()
  mockActiveSite = { activeSite: null, sites: [], isLoading: false }
})

describe('Settings landing (permission-aware index)', () => {
  it('renders the masthead-less section index with Account always visible', () => {
    render(<SettingsLandingPage />)
    // Account panel + its ungated rows.
    expect(screen.getByText('Account')).toBeInTheDocument()
    expect(screen.getByText('Profile')).toBeInTheDocument()
    expect(screen.getByText('Devices')).toBeInTheDocument()
  })

  it('hides gated rows for a user with no permissions — membership-implied rows stay', () => {
    // A site exists; the user simply holds no gated permissions.
    mockActiveSite = {
      activeSite: { name: 'Acme', domain: 'acme.com', is_verified: true },
      sites: [{ id: 's1' }],
      isLoading: false,
    }
    render(<SettingsLandingPage />)
    // Permission-gated rows are gone (nothing granted).
    expect(screen.queryByText('Goals')).not.toBeInTheDocument()
    expect(screen.queryByText('Audit Log')).not.toBeInTheDocument()
    // Bot & Spam and Members are membership-implied since the never-checked
    // view permissions were deleted (batch 4) — every member sees them, which
    // is what the server enforced all along.
    // Monitoring joined them 14-09-2026 (design §11a): read surfaces for every
    // member; its one mutation gates on uptime.manage inside the tab.
    expect(screen.getByText('Monitoring')).toBeInTheDocument()
    expect(screen.getByText('Bot & Spam')).toBeInTheDocument()
    expect(screen.getByText('Members')).toBeInTheDocument()
  })

  it('reveals gated rows once the permissions are held', () => {
    grantedPerms = new Set(ALL_PERMS)
    mockActiveSite = {
      activeSite: { name: 'Acme', domain: 'acme.com', is_verified: true },
      sites: [{ id: 's1' }],
      isLoading: false,
    }
    render(<SettingsLandingPage />)
    expect(screen.getByText('Goals')).toBeInTheDocument()
    expect(screen.getByText('Bot & Spam')).toBeInTheDocument()
    expect(screen.getByText('Members')).toBeInTheDocument()
    expect(screen.getByText('Audit Log')).toBeInTheDocument()
    // The MCP row carries its "New" badge beside the label (PULSE-54).
    const mcp = screen.getByText('MCP').closest('p')
    expect(mcp?.querySelector('[data-badge]')?.textContent).toBe('New')
    // Active-site context surfaces in the Site panel.
    expect(screen.getByText('Acme')).toBeInTheDocument()
    expect(screen.getByText('acme.com')).toBeInTheDocument()
  })

  it('shows the zero-site state (not the tab rows) when there are no sites', () => {
    grantedPerms = new Set(['sites.edit', 'goals.manage'])
    mockActiveSite = { activeSite: null, sites: [], isLoading: false }
    render(<SettingsLandingPage />)
    expect(screen.getByText('No sites yet')).toBeInTheDocument()
    const create = screen.getByText('Create a site').closest('a')
    expect(create).toHaveAttribute('href', '/sites/new')
    // The per-site tab rows are suppressed until a site exists.
    expect(screen.queryByText('Goals')).not.toBeInTheDocument()
  })
})

describe('Settings landing — round two (owner pick L2, 17-09-2026)', () => {
  it('sets the groups side by side on large screens, one column below', () => {
    grantedPerms = new Set(ALL_PERMS)
    mockActiveSite = { activeSite: { name: 'Acme', domain: 'acme.example', is_verified: true }, sites: [{}], isLoading: false }
    const { container } = render(<SettingsLandingPage />)
    const grid = container.firstElementChild as HTMLElement
    expect(grid.className).toMatch(/\bgrid\b/)
    expect(grid.className).toMatch(/lg:grid-cols-\[repeat\(auto-fit,minmax\(320px,1fr\)\)\]/)
    expect(grid.className).not.toMatch(/space-y-8/)
    expect(grid.querySelectorAll('section')).toHaveLength(3)
  })
})
