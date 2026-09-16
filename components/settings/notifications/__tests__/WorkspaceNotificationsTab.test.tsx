import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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
      // NOTIFICATION_CATEGORIES entry when the wire has no row, so a mock
      // that lagged the registry would still pass and hide a real
      // divergence.
      { category_id: 'lifecycle', display_name: 'Getting started' },
    ],
  })
})

describe('WorkspaceNotificationsTab (round-3 org page)', () => {
  it('states Always on, via a neutral StatusChip, on both critical categories', async () => {
    render(<WorkspaceNotificationsTab />)
    await waitFor(() => expect(screen.getAllByText('Always on').length).toBe(2))
  })

  it('renders NO switches, a control that writes nowhere is the "off that isn\'t off" class', () => {
    render(<WorkspaceNotificationsTab />)
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('suppressible categories route to member settings, not to an org control', async () => {
    render(<WorkspaceNotificationsTab />)
    await waitFor(() =>
      // 5 suppressible categories: uptime, site, team, system, lifecycle.
      // Only billing and security are always on.
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

  // ── Structure the brief retires the hand-rolled panels for (mutation group A) ──
  it('titles both panels the way the dashboard titles a section, sentence case, no kicker', () => {
    render(<WorkspaceNotificationsTab />)
    for (const name of ['Workspace notifications', 'Alert channels']) {
      const h2 = screen.getByRole('heading', { level: 2, name })
      expect(h2.className).toMatch(/\btext-sm\b/)
      expect(h2.className).toMatch(/\bfont-semibold\b/)
      expect(h2.className).not.toMatch(/uppercase|micro-label/)
      // The landmark section is labelled by its own heading, the SettingsPanel
      // contract, never a bare <h2> floating outside a panel.
      expect(h2.closest('section')?.getAttribute('aria-labelledby')).toBe(h2.id)
    }
  })

  // ── A failed wire read must say so, never fail silently (mutation group B) ──
  it('names a failed category read instead of swallowing it, and keeps the fallback names up', async () => {
    getPrefsDocument.mockRejectedValue(new Error('network down'))
    render(<WorkspaceNotificationsTab />)
    const banner = await screen.findByRole('alert')
    expect(banner).toHaveTextContent("Couldn't load the notification categories")
    // The local registry names still render, so the panel is never blank on
    // top of being honest about the wire failure.
    expect(screen.getByText('Billing')).toBeInTheDocument()
    expect(screen.getByText('Security')).toBeInTheDocument()
  })

  // ── The retired Link-styled-as-a-button becomes a real Button (mutation group C) ──
  it('renders "Notification settings" as a real outline Button, not a hand-styled link', () => {
    render(<WorkspaceNotificationsTab />)
    const link = screen.getByRole('link', { name: 'Notification settings' })
    // Facet's outline rung; a hand-rolled anchor never carries this class.
    expect(link.className).toMatch(/border-input/)
  })

  // ── The copy pass: no em dash, no en dash, no literal ellipsis (mutation group D) ──
  it('has no dashes or literal ellipses anywhere in the source', () => {
    const source = readFileSync(
      join(process.cwd(), 'components/settings/notifications/WorkspaceNotificationsTab.tsx'),
      'utf8',
    )
    // Strip comments (/* */ and //) before scanning so a stripped-out
    // discussion of the retired dash-having copy does not self-trigger.
    const stripped = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    expect(stripped).not.toMatch(/[—–]/)
    expect(stripped).not.toMatch(/\.\.\./)
  })
})
