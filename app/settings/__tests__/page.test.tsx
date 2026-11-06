// `/settings` is no longer an index (settings overhaul R3: one list needs none). It lands on the person's first page,
// or, for a team with no sites yet, the first page that is not a site's; and it decides nothing while the sites load.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }))

let mockActiveSite: { sites: unknown[]; isLoading: boolean }
vi.mock('@/components/settings/active-site', () => ({ useActiveSite: () => mockActiveSite }))

let grantedPerms: Set<string>
vi.mock('@/lib/auth/permissions', () => ({ useCan: (p: string) => grantedPerms.has(p) }))
vi.mock('@/components/settings/SettingsLoadingState', () => ({ default: () => <div data-testid="loading" /> }))
vi.mock('@phosphor-icons/react', () => new Proxy({}, {
  get: (_target, prop) => (prop === 'then' ? undefined : () => null),
  has: () => true,
}))

import SettingsIndexPage from '../page'

const OWNER = ['sites.edit', 'goals.manage', 'billing.view', 'integrations.manage']

beforeEach(() => {
  replace.mockReset()
  grantedPerms = new Set(OWNER)
  mockActiveSite = { sites: [{ id: 'a' }], isLoading: false }
})

describe('/settings', () => {
  it('lands an owner on General', () => {
    const { getByTestId } = render(<SettingsIndexPage />)
    expect(replace).toHaveBeenCalledWith('/settings/site/general')
    // It draws only the loading state while the redirect happens: there is no index to show.
    expect(getByTestId('loading')).toBeInTheDocument()
  })

  it('lands a member on Sharing, the first page a member can use', () => {
    grantedPerms = new Set(['billing.view', 'analytics.export'])
    render(<SettingsIndexPage />)
    expect(replace).toHaveBeenCalledWith('/settings/site/visibility')
  })

  it('lands a team with no sites on Team, the first page that is not a site\'s', () => {
    mockActiveSite = { sites: [], isLoading: false }
    render(<SettingsIndexPage />)
    expect(replace).toHaveBeenCalledWith('/settings/organization/members')
  })

  it('decides nothing while the sites are loading', () => {
    mockActiveSite = { sites: [], isLoading: true }
    render(<SettingsIndexPage />)
    expect(replace).not.toHaveBeenCalled()
  })
})
