import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/dynamic', () => ({
  default: () => () => <div data-testid="tab-content">tab</div>,
}))

const h = vi.hoisted(() => ({
  tab: 'members',
  replace: vi.fn(),
  can: true,
  teamState: 'team' as 'alone' | 'team' | null,
}))
vi.mock('@/lib/hooks/useTeamState', () => ({ useTeamState: () => h.teamState }))
vi.mock('next/navigation', () => ({
  useParams: () => ({ tab: h.tab }),
  useRouter: () => ({ replace: h.replace }),
}))
// Only Billing gates at the route (billing.view); each test drives a single tab.
vi.mock('@/lib/auth/permissions', () => ({ useCan: () => h.can }))

import OrganizationSettingsTabPage from '../page'

beforeEach(() => {
  h.teamState = 'team'
  h.tab = 'members'
  h.can = true
  h.replace.mockClear()
})

describe('Team settings routing (settings overhaul: Team, Billing, Developers)', () => {
  it.each(['members', 'billing', 'api-keys'])('renders the %s page', (tab) => {
    h.tab = tab
    render(<OrganizationSettingsTabPage />)
    expect(screen.getByTestId('tab-content')).toBeInTheDocument()
    expect(h.replace).not.toHaveBeenCalled()
  })

  it('gates Billing behind billing.view', () => {
    h.tab = 'billing'
    h.can = false
    render(<OrganizationSettingsTabPage />)
    expect(screen.getByText('Owners and admins only')).toBeInTheDocument()
    expect(screen.queryByTestId('tab-content')).not.toBeInTheDocument()
  })

  it('leaves Team and Developers to say who they are for themselves', () => {
    h.can = false
    for (const tab of ['members', 'api-keys']) {
      h.tab = tab
      const { unmount } = render(<OrganizationSettingsTabPage />)
      expect(screen.getByTestId('tab-content')).toBeInTheDocument()
      unmount()
    }
  })

  it.each([
    ['general', 'members'],
    ['roles', 'members'],
    ['beta', 'members'],
    ['audit', 'members'],
    ['mcp', 'api-keys'],
    ['connected-apps', 'api-keys'],
  ])('sends the old %s address to %s', (from, to) => {
    h.tab = from
    render(<OrganizationSettingsTabPage />)
    expect(h.replace).toHaveBeenCalledWith(`/settings/organization/${to}`)
    expect(screen.queryByTestId('tab-content')).not.toBeInTheDocument()
  })

  it('sends an unknown tab to Team', () => {
    h.tab = 'notifications'
    render(<OrganizationSettingsTabPage />)
    expect(h.replace).toHaveBeenCalledWith('/settings/organization/members')
  })
})

describe('Owners and admins only (PULSE-59)', () => {
  it('points a team member at the team owner', () => {
    h.tab = 'billing'
    h.can = false
    render(<OrganizationSettingsTabPage />)
    expect(screen.getByText('Ask the owner of your team to open it for you.')).toBeInTheDocument()
  })

  it('names nobody to ask when the person works alone', () => {
    h.tab = 'billing'
    h.can = false
    h.teamState = 'alone'
    render(<OrganizationSettingsTabPage />)
    expect(screen.queryByText(/Ask the owner/)).not.toBeInTheDocument()
  })
})
