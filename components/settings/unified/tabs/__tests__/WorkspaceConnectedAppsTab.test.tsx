import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import type { Connection } from '@/lib/api/connect'

// Settings → Connected apps (PULSE-41, option A, owner 24-09-2026): the
// API-keys list twinned. What these pin: a verified app's row carries its
// logo and a self-registered one only a monogram plus the "Unverified" word;
// who connected it reads like the Members tab; Disconnect confirms, then calls
// the server; a load failure is an error, never an empty list.

const listConnectedApps = vi.fn()
const disconnectApp = vi.fn()
vi.mock('@/lib/api/connect', () => ({
  listConnectedApps: (...a: unknown[]) => listConnectedApps(...a),
  disconnectApp: (...a: unknown[]) => disconnectApp(...a),
}))
const getOrganizationMembers = vi.fn()
vi.mock('@/lib/api/organization', () => ({
  getOrganizationMembers: (...a: unknown[]) => getOrganizationMembers(...a),
}))
vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ user: { id: 'u_me', email: 'me@x', org_id: 'org_a' } }),
}))
vi.mock('@/lib/hooks/useDisplayZone', () => ({ useDisplayZone: () => ({ zone: 'UTC' }) }))
vi.mock('@/components/ui/ConfirmDialog', () => ({
  ConfirmDialog: ({ open, title, description, onConfirm }: any) =>
    open ? (
      <div role="dialog">
        <p>{title}</p>
        <p>{description}</p>
        <button onClick={onConfirm}>Confirm disconnect</button>
      </div>
    ) : null,
}))
const toastSuccess = vi.fn()
vi.mock('@ciphera-net/facet', () => ({
  cn: (...args: any[]) => args.flat(Infinity).filter(Boolean).join(' '),
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Spinner: () => <span />,
  toast: { success: (...a: unknown[]) => toastSuccess(...a), error: vi.fn() },
}))

import WorkspaceConnectedAppsTab from '../WorkspaceConnectedAppsTab'

const base: Omit<Connection, 'id' | 'client_name' | 'client_verified' | 'client_brand' | 'user_id' | 'status'> = {
  redirect_host: 'claude.ai', scope_all_sites: false, site_ids: ['s1', 's2'], created_at: '2026-09-24T08:00:00Z',
  last_used_at: null, expires_at: '2026-10-24T08:00:00Z', revoked_at: null, revoked_reason: null,
}
const claude: Connection = { ...base, id: 'g1', client_name: 'Claude', client_verified: true, client_brand: 'claude', user_id: 'u_me', status: 'connected' }
const bot: Connection = { ...base, id: 'g2', client_name: 'Weekly report bot', client_verified: false, client_brand: null, user_id: 'u_alex', status: 'connected', scope_all_sites: true, site_ids: [] }
const cursor: Connection = { ...base, id: 'g3', client_name: 'Cursor', client_verified: true, client_brand: 'cursor', user_id: 'u_gone', status: 'disconnected', revoked_at: '2026-09-24T09:00:00Z' }

beforeEach(() => {
  listConnectedApps.mockReset().mockResolvedValue({ connections: [claude, bot, cursor] })
  disconnectApp.mockReset().mockResolvedValue({})
  getOrganizationMembers.mockReset().mockResolvedValue([{ user_id: 'u_alex', user_email: 'alex@acme.com', role: 'admin' }])
  toastSuccess.mockReset()
})

describe('WorkspaceConnectedAppsTab', () => {
  it('draws a verified app with its logo and a self-registered one with a monogram and the Unverified word', async () => {
    render(<WorkspaceConnectedAppsTab />)
    const claudeRow = await screen.findByTestId('connection-row-g1')
    expect(claudeRow.querySelector('img[data-brand="claude"]')).toBeTruthy()
    expect(within(claudeRow).queryByText('Unverified')).toBeNull()
    const botRow = screen.getByTestId('connection-row-g2')
    expect(botRow.querySelector('img')).toBeNull()
    expect(botRow.querySelector('[data-monogram]')?.textContent).toBe('W')
    expect(within(botRow).getByText('Unverified')).toBeTruthy()
  })

  it('says who connected each app the way the Members tab does', async () => {
    render(<WorkspaceConnectedAppsTab />)
    expect(await within(await screen.findByTestId('connection-row-g1')).findByText('Connected by you')).toBeTruthy()
    expect(within(screen.getByTestId('connection-row-g2')).getByText('Connected by alex@acme.com')).toBeTruthy()
    expect(within(screen.getByTestId('connection-row-g3')).getByText('Connected by Member u_gone')).toBeTruthy()
  })

  it('offers Disconnect only on live connections, confirms first, then calls the server', async () => {
    render(<WorkspaceConnectedAppsTab />)
    await screen.findByTestId('connection-row-g1')
    expect(within(screen.getByTestId('connection-row-g3')).queryByRole('button', { name: /Disconnect/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect Claude' }))
    expect(disconnectApp).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog').textContent).toContain('Disconnect Claude?')
    fireEvent.click(screen.getByText('Confirm disconnect'))
    await waitFor(() => expect(disconnectApp).toHaveBeenCalledWith('g1'))
  })

  it('shows the empty state for a workspace with nothing connected', async () => {
    listConnectedApps.mockResolvedValue({ connections: [] })
    render(<WorkspaceConnectedAppsTab />)
    expect(await screen.findByText('No connected apps yet')).toBeTruthy()
  })

  it('shows an error, not an empty list, when the connections cannot be loaded', async () => {
    listConnectedApps.mockRejectedValue(new Error('boom'))
    render(<WorkspaceConnectedAppsTab />)
    expect(await screen.findByText("Couldn't load your connected apps")).toBeTruthy()
    expect(screen.queryByText('No connected apps yet')).toBeNull()
  })

  it('still lists the connections when the members list fails (names only decorate)', async () => {
    getOrganizationMembers.mockRejectedValue(new Error('id down'))
    render(<WorkspaceConnectedAppsTab />)
    expect(await within(await screen.findByTestId('connection-row-g2')).findByText('Connected by Member u_alex')).toBeTruthy()
  })
})
