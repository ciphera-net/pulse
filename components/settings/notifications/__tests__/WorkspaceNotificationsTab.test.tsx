import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { CategorySettingsResponse } from '@/lib/api/notifications-categories'

// --- Mocks ---------------------------------------------------------------

vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}))

// Lightweight facet stand-ins (same approach as WorkspaceBillingTab.test) so the
// smoke test exercises composition, not facet internals.
vi.mock('@ciphera-net/facet', () => ({
  // cn re-exports from facet via @/lib/utils, which the panel primitives use.
  cn: (...args: any[]) => args.flat(Infinity).filter(Boolean).join(' '),
  Toggle: ({ checked, disabled, onChange }: any) => (
    <button role="switch" aria-checked={checked} disabled={disabled} onClick={onChange}>
      toggle
    </button>
  ),
  Banner: ({ title, children, action }: any) => (
    <div role="alert">
      <span>{title}</span>
      <span>{children}</span>
      {action}
    </div>
  ),
  Button: ({ children, isLoading, variant, size, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}))

vi.mock('@/lib/api/notifications-categories', () => ({
  getCategorySettings: vi.fn(),
  updateCategorySettings: vi.fn(),
}))

import * as api from '@/lib/api/notifications-categories'
import WorkspaceNotificationsTab from '../WorkspaceNotificationsTab'

const CATEGORIES: CategorySettingsResponse = {
  settings: { uptime: true },
  categories: [
    { id: 'billing', label: 'Billing', description: 'Billing alerts' },
    { id: 'security', label: 'Security', description: 'Security alerts' },
    { id: 'uptime', label: 'Uptime', description: 'Uptime alerts' },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.getCategorySettings).mockResolvedValue(CATEGORIES)
})

describe('WorkspaceNotificationsTab', () => {
  it('renders category rows with locked "Always on" categories and the account cross-link', async () => {
    render(<WorkspaceNotificationsTab />)

    await waitFor(() => expect(screen.getByText('Uptime')).toBeInTheDocument())
    expect(screen.getByText('Billing')).toBeInTheDocument()
    expect(screen.getByText('Security')).toBeInTheDocument()

    // Locked categories: two "Always on" mono labels, no orange badge.
    expect(screen.getAllByText('Always on')).toHaveLength(2)

    // Locked toggles rendered on + disabled; the unlocked one is enabled.
    const switches = screen.getAllByRole('switch')
    expect(switches.filter(s => (s as HTMLButtonElement).disabled)).toHaveLength(2)

    // Cross-link to Account · Notifications (kept from P1).
    expect(
      screen.getByRole('link', { name: /Account · Notifications/ }),
    ).toHaveAttribute('href', '/settings/account/notifications')
  })

  it('surfaces a category-settings load failure as an error state with a retry action', async () => {
    vi.mocked(api.getCategorySettings).mockRejectedValue(new Error('Boom failure'))
    render(<WorkspaceNotificationsTab />)

    await waitFor(() => expect(screen.getByText('Boom failure')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
