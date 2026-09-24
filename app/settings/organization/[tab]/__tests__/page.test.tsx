import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/dynamic', () => ({
  default: () => () => <div data-testid="tab-content">tab</div>,
}))

const h = vi.hoisted(() => ({ tab: 'general', replace: vi.fn(), canManageRoles: true }))
vi.mock('next/navigation', () => ({
  useParams: () => ({ tab: h.tab }),
  useRouter: () => ({ replace: h.replace }),
}))

// Only roles.manage varies in these tests; everything else the page checks
// (it only checks the required perm for the active tab) resolves off this
// same flag, which is fine because each test drives a single tab.
vi.mock('@/lib/auth/permissions', () => ({
  useCan: () => h.canManageRoles,
}))

import OrganizationSettingsTabPage from '../page'

beforeEach(() => {
  h.tab = 'general'
  h.canManageRoles = true
  h.replace.mockClear()
})

describe('Organization settings tab routing', () => {
  it('renders a gated tab (roles) when its permission is satisfied', () => {
    h.tab = 'roles'
    h.canManageRoles = true
    render(<OrganizationSettingsTabPage />)
    expect(screen.getByTestId('tab-content')).toBeInTheDocument()
    expect(screen.queryByText('Access restricted')).not.toBeInTheDocument()
  })

  it('gates roles behind roles.manage', () => {
    h.tab = 'roles'
    h.canManageRoles = false
    render(<OrganizationSettingsTabPage />)
    expect(screen.getByText('Access restricted')).toBeInTheDocument()
    expect(screen.queryByTestId('tab-content')).not.toBeInTheDocument()
  })

  it('has no workspace notifications tab any more (ruling D7, 21-09-2026)', () => {
    h.tab = 'notifications'
    render(<OrganizationSettingsTabPage />)
    // An unknown tab redirects to the section default rather than rendering.
    expect(screen.queryByTestId('tab-content')).not.toBeInTheDocument()
    expect(h.replace).toHaveBeenCalled()
  })

  it('renders ungated org tabs (general)', () => {
    h.tab = 'general'
    render(<OrganizationSettingsTabPage />)
    expect(screen.getByTestId('tab-content')).toBeInTheDocument()
  })

  it('redirects unknown tabs to the section default', () => {
    h.tab = 'made-up'
    render(<OrganizationSettingsTabPage />)
    expect(h.replace).toHaveBeenCalledWith('/settings/organization/general')
  })

  it('sends the old Connected apps address to the MCP page, not to the default (PULSE-54)', () => {
    h.tab = 'connected-apps'
    render(<OrganizationSettingsTabPage />)
    expect(h.replace).toHaveBeenCalledTimes(1)
    expect(h.replace).toHaveBeenCalledWith('/settings/organization/mcp')
    expect(screen.queryByTestId('tab-content')).not.toBeInTheDocument()
  })

  it('renders the MCP page, gated like API keys (PULSE-54)', () => {
    h.tab = 'mcp'
    h.canManageRoles = true
    const { unmount } = render(<OrganizationSettingsTabPage />)
    expect(screen.getByTestId('tab-content')).toBeInTheDocument()
    expect(h.replace).not.toHaveBeenCalled()
    unmount()

    h.canManageRoles = false
    render(<OrganizationSettingsTabPage />)
    expect(screen.getByText('Access restricted')).toBeInTheDocument()
    expect(screen.queryByTestId('tab-content')).not.toBeInTheDocument()
  })
})
