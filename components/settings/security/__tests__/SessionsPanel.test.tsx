import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const auth = vi.hoisted(() => ({ logout: vi.fn() }))
vi.mock('@/lib/auth/context', () => ({ useAuth: () => ({ logout: auth.logout }) }))

const api = vi.hoisted(() => ({ getUserSessions: vi.fn(), revokeSession: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/api/user', () => api)

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: any[]) => a.flat(Infinity).filter(Boolean).join(' '),
  Button: ({ children, asChild, isLoading, ...p }: any) => <button {...p}>{children}</button>,
  toast: toastMock,
}))
vi.mock('@phosphor-icons/react', () => new Proxy({}, {
  get: (_t, prop) => (prop === 'then' ? undefined : () => null),
  has: () => true,
}))
vi.mock('@/components/ui/ConfirmDialog', () => ({
  ConfirmDialog: ({ open, title, confirmLabel, onConfirm }: any) =>
    open ? <div role="dialog" aria-label={title}><button onClick={onConfirm}>{confirmLabel}</button></div> : null,
}))

import SessionsPanel, { describeSession } from '../SessionsPanel'

const now = Date.now()
const mine = { id: 's-me', client_ip: '203.0.113.7', user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/128', created_at: new Date(now - 3600e3).toISOString(), expires_at: new Date(now + 86400e3).toISOString(), is_current: true }
const other = { id: 's-other', client_ip: '198.51.100.9', user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17) Safari/605', created_at: new Date(now - 86400e3).toISOString(), expires_at: new Date(now + 86400e3).toISOString(), is_current: false }

beforeEach(() => {
  auth.logout.mockReset()
  api.getUserSessions.mockReset()
  api.revokeSession.mockClear()
})

describe('describeSession', () => {
  it('names the browser and the OS, and never the raw string', () => {
    expect(describeSession(mine.user_agent)).toBe('Chrome on macOS')
    expect(describeSession(other.user_agent)).toBe('Safari on iOS')
    expect(describeSession('Mozilla/5.0 (Windows NT 10.0) Edg/128')).toBe('Edge on Windows')
    expect(describeSession(undefined)).toBe('Unknown device')
  })
})

describe('SessionsPanel', () => {
  it('lists every session, marks this device, and signs another one out in place', async () => {
    api.getUserSessions.mockResolvedValue({ sessions: [mine, other] })
    render(<SessionsPanel />)
    expect(screen.getByRole('heading', { level: 2, name: 'Active sessions' })).toBeInTheDocument()
    expect(await screen.findByText('Chrome on macOS')).toBeInTheDocument()
    expect(screen.getByText('This device')).toBeInTheDocument()
    expect(screen.getByText('198.51.100.9')).toBeInTheDocument()
    const buttons = screen.getAllByRole('button', { name: 'Sign out' })
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[1])
    await waitFor(() => expect(api.revokeSession).toHaveBeenCalledWith('s-other'))
    expect(auth.logout).not.toHaveBeenCalled()
    await waitFor(() => expect(api.getUserSessions).toHaveBeenCalledTimes(2))
  })

  it('confirms before signing out this device, then signs out', async () => {
    api.getUserSessions.mockResolvedValue({ sessions: [mine] })
    render(<SessionsPanel />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    const dialog = screen.getByRole('dialog', { name: 'Sign out of this device?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(api.revokeSession).toHaveBeenCalledWith('s-me'))
    await waitFor(() => expect(auth.logout).toHaveBeenCalledTimes(1))
  })

  it('names the failed load', async () => {
    api.getUserSessions.mockRejectedValue(new Error('boom'))
    render(<SessionsPanel />)
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your sessions")
  })
})
