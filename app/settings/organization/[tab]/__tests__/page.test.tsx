import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/dynamic', () => ({
  default: () => () => <div data-testid="tab-content">tab</div>,
}))

const h = vi.hoisted(() => ({ tab: 'general', replace: vi.fn(), canManageNotifications: true }))
vi.mock('next/navigation', () => ({
  useParams: () => ({ tab: h.tab }),
  useRouter: () => ({ replace: h.replace }),
}))

// Only notification_settings.manage varies in these tests; everything else the
// page checks (it only checks the required perm for the active tab) resolves off
// this same flag, which is fine because each test drives a single tab.
vi.mock('@/lib/auth/permissions', () => ({
  useCan: () => h.canManageNotifications,
}))

import OrganizationSettingsTabPage from '../page'

beforeEach(() => {
  h.tab = 'general'
  h.canManageNotifications = true
  h.replace.mockClear()
})

describe('Organization settings tab routing (notifications = workspace side)', () => {
  it('renders the workspace notifications tab when the manager gate is satisfied', () => {
    h.tab = 'notifications'
    h.canManageNotifications = true
    render(<OrganizationSettingsTabPage />)
    expect(screen.getByTestId('tab-content')).toBeInTheDocument()
    expect(screen.queryByText('Access restricted')).not.toBeInTheDocument()
  })

  it('gates org notifications behind notification_settings.manage', () => {
    h.tab = 'notifications'
    h.canManageNotifications = false
    render(<OrganizationSettingsTabPage />)
    expect(screen.getByText('Access restricted')).toBeInTheDocument()
    expect(screen.queryByTestId('tab-content')).not.toBeInTheDocument()
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
})
