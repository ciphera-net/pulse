import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const getPrefsDocument = vi.fn()
vi.mock('@/lib/api/notifications-preferences', () => ({
  getPrefsDocument: () => getPrefsDocument(),
}))

import WorkspaceNotificationsTab from '../WorkspaceNotificationsTab'

beforeEach(() => {
  vi.clearAllMocks()
  getPrefsDocument.mockResolvedValue({
    categories: [
      { category_id: 'billing', display_name: 'Billing' },
      { category_id: 'security', display_name: 'Security' },
      { category_id: 'uptime', display_name: 'Uptime' },
      { category_id: 'site', display_name: 'Site activity' },
      { category_id: 'team', display_name: 'Team' },
      { category_id: 'system', display_name: 'System' },
      // lifecycle arrived with iris migration 026 (the D7 nudge). The mock
      // mirrors the wire deliberately: the tab falls back to the local
      // NOTIFICATION_CATEGORIES entry when the wire has no row, so a mock that
      // lagged the registry would still pass and hide a real divergence.
      { category_id: 'lifecycle', display_name: 'Getting started' },
    ],
  })
})

describe('WorkspaceNotificationsTab (round-3 org page)', () => {
  it('states Always on — for everyone on both critical categories', async () => {
    render(<WorkspaceNotificationsTab />)
    await waitFor(() =>
      expect(screen.getAllByText('Always on — for everyone').length).toBe(2),
    )
  })

  it('renders NO switches — a control that writes nowhere is the "off that isn\'t off" class', () => {
    render(<WorkspaceNotificationsTab />)
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('suppressible categories route to member settings, not to an org control', async () => {
    render(<WorkspaceNotificationsTab />)
    await waitFor(() =>
      // 5 suppressible categories: uptime, site, team, system, lifecycle.
      // Only billing and security are always-on.
      expect(screen.getAllByText('Delivered per member settings').length).toBe(5),
    )
  })

  it('the alert-channels panel renders the honest retired state (copy round §5)', () => {
    render(<WorkspaceNotificationsTab />)
    expect(
      screen.getByText(
        /Email alert channels were retired on 31-08-2026\. Uptime and site notifications now route through each member's notification settings\./,
      ),
    ).toBeInTheDocument()
  })

  it('points to the personal settings page', () => {
    render(<WorkspaceNotificationsTab />)
    const links = screen.getAllByRole('link', { name: /Notification settings|Account · Notifications/ })
    expect(links.length).toBeGreaterThanOrEqual(1)
  })
})
