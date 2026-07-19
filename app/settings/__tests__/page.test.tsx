import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// cn is the only facet surface the panel primitives touch.
vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: unknown[]) => a.filter(Boolean).join(' '),
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
  'quarantine.view',
  'privacy_scan.manage',
  'reports.manage',
  'integrations.manage',
  'team.view',
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

  it('hides the entire Site section for a user with no site permissions', () => {
    render(<SettingsLandingPage />)
    // Site-only rows are gone (no site permissions granted).
    expect(screen.queryByText('Goals')).not.toBeInTheDocument()
    expect(screen.queryByText('Bot & Spam')).not.toBeInTheDocument()
    // Gated org rows also gone…
    expect(screen.queryByText('Members')).not.toBeInTheDocument()
    expect(screen.queryByText('Audit Log')).not.toBeInTheDocument()
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
