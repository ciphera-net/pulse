import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// The shared ProfileSettings is security-sensitive and out of this tab's
// ownership — stub it and assert only that the wrap forwards the exact props it
// must never change (activeTab="security", borderless).
vi.mock('@/components/settings/ProfileSettings', () => ({
  default: ({ activeTab, borderless }: { activeTab?: string; borderless?: boolean }) => (
    <div data-testid="profile-settings" data-active-tab={activeTab} data-borderless={String(borderless)} />
  ),
}))

import AccountSecurityTab from '../AccountSecurityTab'

describe('AccountSecurityTab (wrap-only)', () => {
  it('renders the shared ProfileSettings on the security tab, borderless, untouched', () => {
    render(<AccountSecurityTab />)
    const ps = screen.getByTestId('profile-settings')
    expect(ps.dataset.activeTab).toBe('security')
    expect(ps.dataset.borderless).toBe('true')
  })

  it('does not inject a duplicate page-level heading (masthead owns it)', () => {
    render(<AccountSecurityTab />)
    expect(screen.queryByRole('heading')).toBeNull()
  })
})
