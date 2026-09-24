import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import type { Connection } from '@/lib/api/connect'

// Settings → MCP (PULSE-54, option A, owner 24-09-2026): setup first, then connections.
// What these pin: only LIVE connections are listed (no history of disconnected or lapsed ones)
// with a small dot-and-word indicator, never a chip; a verified app's row carries its logo and
// a self-registered one only a monogram plus the "Unverified" word; who connected it reads like
// the Members tab; Disconnect confirms, then calls the server; a load failure is an error, never
// an empty list, and the setup guide still renders; the picker swaps the steps, and the server
// URL is this environment's.

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
  RailGrid: ({ children, className }: any) => <div data-railgrid className={className}>{children}</div>,
  Spinner: () => <span />,
  CheckIcon: () => <span />,
  CopyIcon: () => <span />,
  toast: { success: (...a: unknown[]) => toastSuccess(...a), error: vi.fn() },
}))
vi.mock('@/lib/api/client', () => ({ API_URL: 'https://pulse-api-staging.ciphera.net' }))

import WorkspaceMcpTab from '../WorkspaceMcpTab'

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

describe('WorkspaceMcpTab', () => {
  it('lists live connections only: a disconnected one is not shown at all', async () => {
    render(<WorkspaceMcpTab />)
    await screen.findByTestId('connection-row-g1')
    expect(screen.getByTestId('connection-row-g2')).toBeTruthy()
    expect(screen.queryByTestId('connection-row-g3')).toBeNull()
    expect(screen.queryByText(/Disconnected/)).toBeNull()
  })

  it('does not list a lapsed connection either', async () => {
    listConnectedApps.mockResolvedValue({ connections: [claude, { ...bot, status: 'lapsed' }] })
    render(<WorkspaceMcpTab />)
    await screen.findByTestId('connection-row-g1')
    expect(screen.queryByTestId('connection-row-g2')).toBeNull()
  })

  it('marks a live connection with a small dot and the word, not a chip', async () => {
    render(<WorkspaceMcpTab />)
    const row = await screen.findByTestId('connection-row-g1')
    const ind = within(row).getByTestId('connected-indicator')
    expect(ind.textContent).toBe('Connected')
    expect(ind.querySelector('.rounded-full')).toBeTruthy()
    expect(ind.className).not.toMatch(/border/)
  })

  it('draws a verified app with its logo and a self-registered one with a monogram and the Unverified word', async () => {
    render(<WorkspaceMcpTab />)
    const claudeRow = await screen.findByTestId('connection-row-g1')
    expect(claudeRow.querySelector('img[data-brand="claude"]')).toBeTruthy()
    expect(within(claudeRow).queryByText('Unverified')).toBeNull()
    const botRow = screen.getByTestId('connection-row-g2')
    expect(botRow.querySelector('img')).toBeNull()
    expect(botRow.querySelector('[data-monogram]')?.textContent).toBe('W')
    expect(within(botRow).getByText('Unverified')).toBeTruthy()
  })

  it('says who connected each app the way the Members tab does', async () => {
    render(<WorkspaceMcpTab />)
    expect(await within(await screen.findByTestId('connection-row-g1')).findByText('Connected by you')).toBeTruthy()
    expect(within(screen.getByTestId('connection-row-g2')).getByText('Connected by alex@acme.com')).toBeTruthy()
  })

  it('confirms before disconnecting, then calls the server', async () => {
    render(<WorkspaceMcpTab />)
    await screen.findByTestId('connection-row-g1')
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect Claude' }))
    expect(disconnectApp).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog').textContent).toContain('Disconnect Claude?')
    fireEvent.click(screen.getByText('Confirm disconnect'))
    await waitFor(() => expect(disconnectApp).toHaveBeenCalledWith('g1'))
  })

  it('shows the empty state when nothing is live', async () => {
    listConnectedApps.mockResolvedValue({ connections: [cursor] })
    render(<WorkspaceMcpTab />)
    expect(await screen.findByText('No assistants connected yet')).toBeTruthy()
  })

  it('shows an error, not an empty list, when the connections cannot be loaded, and keeps the setup guide', async () => {
    listConnectedApps.mockRejectedValue(new Error('boom'))
    render(<WorkspaceMcpTab />)
    expect(await screen.findByText("Couldn't load your connected apps")).toBeTruthy()
    expect(screen.queryByText('No assistants connected yet')).toBeNull()
    expect(screen.getByRole('list', { name: 'Connect Claude' })).toBeTruthy()
  })

  it('still lists the connections when the members list fails (names only decorate)', async () => {
    getOrganizationMembers.mockRejectedValue(new Error('id down'))
    render(<WorkspaceMcpTab />)
    expect(await within(await screen.findByTestId('connection-row-g2')).findByText('Connected by Member u_alex')).toBeTruthy()
  })

  it('sets up first, then lists the connections (owner ruling, option A)', async () => {
    render(<WorkspaceMcpTab />)
    await screen.findByTestId('connection-row-g1')
    const regions = screen.getAllByRole('region').map((r) => r.querySelector('h2')?.textContent)
    expect(regions).toEqual(['MCP', 'Connected apps'])
  })

  it('opens on Claude and swaps the numbered steps when another assistant is picked', async () => {
    render(<WorkspaceMcpTab />)
    expect(screen.getByRole('button', { name: 'Claude' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('list', { name: 'Connect Claude' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cursor' }))
    expect(screen.getByRole('button', { name: 'Cursor' }).getAttribute('aria-pressed')).toBe('true')
    const steps = screen.getByRole('list', { name: 'Connect Cursor' })
    expect(steps.textContent).toContain('pulse-analytics-cursor')
    expect(within(steps).getAllByRole('listitem').length).toBeGreaterThanOrEqual(3)
  })

  it("shows THIS environment's server URL, never another's", async () => {
    render(<WorkspaceMcpTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Claude Code' }))
    const steps = screen.getByRole('list', { name: 'Connect Claude Code' })
    expect(steps.textContent).toContain('claude mcp add --transport http pulse https://pulse-api-staging.ciphera.net/mcp')
    expect(steps.textContent).not.toContain('https://pulse-api.ciphera.net/mcp')
  })

  it("names each step's Copy button apart, even when two steps share a label (Claude Code)", () => {
    render(<WorkspaceMcpTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Claude Code' }))
    const steps = screen.getByRole('list', { name: 'Connect Claude Code' })
    const names = within(steps).getAllByRole('button').map((b) => b.getAttribute('aria-label'))
    expect(names).toEqual(['Copy Terminal for step 1', 'Copy Terminal for step 2'])
  })

  it('draws a vendor mark on every tile but Other', () => {
    const { container } = render(<WorkspaceMcpTab />)
    const tiles = container.querySelectorAll('[data-railgrid] > button')
    expect(tiles.length).toBe(8)
    expect(container.querySelectorAll('[data-railgrid] img[data-client]').length).toBe(7)
  })
})
