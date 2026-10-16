import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Device } from '@/lib/api/devices'

const auth = vi.hoisted(() => ({ logout: vi.fn() }))
vi.mock('@/lib/auth/context', () => ({ useAuth: () => ({ logout: auth.logout }) }))
// Deterministic regardless of the suite's pinned TZ (vitest.setup.ts).
vi.mock('@/lib/hooks/useDisplayZone', () => ({ useDisplayZone: () => ({ zone: 'UTC' }) }))

const api = vi.hoisted(() => ({
  listDevices: vi.fn(),
  signOutDevice: vi.fn(),
  signOutOtherDevices: vi.fn(),
  // Mirrors the real guard: true for a 409 whose body names the one code.
  isCurrentDeviceUnknown: (err: unknown): boolean =>
    !!err &&
    typeof err === 'object' &&
    (err as { status?: number }).status === 409 &&
    (err as { data?: { code?: string } }).data?.code === 'current_device_unknown',
}))
vi.mock('@/lib/api/devices', () => api)

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: unknown[]) => a.filter(Boolean).join(' '),
  Button: ({ children, ...p }: any) => <button {...p}>{children}</button>,
  toast: toastMock,
}))
vi.mock('@phosphor-icons/react', () => new Proxy({}, {
  get: (_t, prop) => (prop === 'then' ? undefined : () => null),
  has: () => true,
}))

import DevicesPanel from '../DevicesPanel'

const now = Date.now()

const device = (over: Partial<Device> = {}): Device => ({
  id: 'd1',
  display_hint: 'Chrome on macOS',
  is_current: false,
  legacy: false,
  apps: ['pulse-app'],
  signed_in_at: new Date(now - 10 * 86400e3).toISOString(),
  last_active_at: new Date(now - 3600e3).toISOString(),
  sessions: 1,
  first_seen_at: new Date(now - 10 * 86400e3).toISOString(),
  last_seen_at: new Date(now - 3600e3).toISOString(),
  ...over,
})

beforeEach(() => {
  auth.logout.mockReset()
  api.listDevices.mockReset()
  api.signOutDevice.mockReset()
  api.signOutOtherDevices.mockReset()
  toastMock.success.mockClear()
  toastMock.error.mockClear()
})

describe('DevicesPanel', () => {
  it('renders one row per device and names the panel', async () => {
    api.listDevices.mockResolvedValue({
      devices: [
        device({ id: 'd0', display_hint: 'Chrome on macOS', is_current: true }),
        device({ id: 'd1', display_hint: 'Edge on Windows' }),
      ],
      current_device_known: true,
    })
    render(<DevicesPanel />)
    expect(await screen.findByRole('heading', { level: 2, name: 'Devices' })).toBeInTheDocument()
    expect(screen.getByText('Chrome on macOS')).toBeInTheDocument()
    expect(screen.getByText('Edge on Windows')).toBeInTheDocument()
    expect(
      screen.getByText('Every browser signed in to your account. Signing one out ends all of its sessions, in every app.'),
    ).toBeInTheDocument()
  })

  it('shows the "This device" chip only on the current device', async () => {
    api.listDevices.mockResolvedValue({
      devices: [
        device({ id: 'd0', display_hint: 'Chrome on macOS', is_current: true }),
        device({ id: 'd1', display_hint: 'Edge on Windows', is_current: false }),
      ],
      current_device_known: true,
    })
    render(<DevicesPanel />)
    await screen.findByText('Chrome on macOS')
    const chips = screen.getAllByText('This device')
    expect(chips).toHaveLength(1)
    expect(chips[0].closest('span')?.parentElement?.textContent).toContain('Chrome on macOS')
  })

  it('builds the caption as apps, joined, then the signed-in date, then relative activity', async () => {
    api.listDevices.mockResolvedValue({
      devices: [
        device({
          id: 'd1',
          apps: ['pulse-app', 'id', 'warden'],
          signed_in_at: '2026-09-10T08:00:00Z',
          last_active_at: new Date(now - 2 * 86400e3).toISOString(),
        }),
      ],
      current_device_known: false,
    })
    render(<DevicesPanel />)
    expect(
      await screen.findByText('Pulse, Ciphera ID and Warden · Signed in 10/09/2026 · Active 2d ago'),
    ).toBeInTheDocument()
  })

  it('joins exactly two apps with "and", and drops an app id it does not know', async () => {
    api.listDevices.mockResolvedValue({
      devices: [
        device({ id: 'd1', apps: ['pulse-app', 'link', 'some-future-client'], signed_in_at: '2026-01-05T00:00:00Z' }),
      ],
      current_device_known: false,
    })
    render(<DevicesPanel />)
    expect(await screen.findByText(/^Pulse and Link · Signed in 05\/01\/2026/)).toBeInTheDocument()
  })

  it('shows "now" rather than "Just now" for activity under a minute old', async () => {
    api.listDevices.mockResolvedValue({
      devices: [device({ id: 'd1', last_active_at: new Date().toISOString() })],
      current_device_known: false,
    })
    render(<DevicesPanel />)
    expect(await screen.findByText(/Active now$/)).toBeInTheDocument()
  })

  it('hides "Everywhere else" when the current device is not known', async () => {
    api.listDevices.mockResolvedValue({
      devices: [device({ id: 'd0', display_hint: 'Chrome on macOS' }), device({ id: 'd1', display_hint: 'Edge on Windows' })],
      current_device_known: false,
    })
    render(<DevicesPanel />)
    await screen.findByText('Chrome on macOS')
    expect(screen.queryByText('Everywhere else')).not.toBeInTheDocument()
  })

  it('hides "Everywhere else" when there is only one device', async () => {
    api.listDevices.mockResolvedValue({
      devices: [device({ id: 'd0', is_current: true })],
      current_device_known: true,
    })
    render(<DevicesPanel />)
    await screen.findByText('Chrome on macOS')
    expect(screen.queryByText('Everywhere else')).not.toBeInTheDocument()
  })

  it('offers "Everywhere else" once the current device is known and another exists', async () => {
    api.listDevices.mockResolvedValue({
      devices: [device({ id: 'd0', is_current: true }), device({ id: 'd1' })],
      current_device_known: true,
    })
    render(<DevicesPanel />)
    expect(await screen.findByText('Everywhere else')).toBeInTheDocument()
    expect(screen.getByText('Sign out of every browser except this one.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out of all other devices' })).toBeInTheDocument()
  })

  it('signing out the current device logs this browser out', async () => {
    api.listDevices.mockResolvedValue({
      devices: [device({ id: 'd0', is_current: true })],
      current_device_known: true,
    })
    api.signOutDevice.mockResolvedValue({ message: 'Signed out', sessions_revoked: 2, this_device: true })
    render(<DevicesPanel />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(api.signOutDevice).toHaveBeenCalledWith('d0'))
    await waitFor(() => expect(auth.logout).toHaveBeenCalledTimes(1))
    expect(api.listDevices).toHaveBeenCalledTimes(1)
  })

  it('signing out another device toasts and reloads the list, without logging out', async () => {
    api.listDevices.mockResolvedValueOnce({
      devices: [device({ id: 'd1', display_hint: 'Old iPhone' })],
      current_device_known: false,
    })
    api.signOutDevice.mockResolvedValue({ message: 'Signed out', sessions_revoked: 1, this_device: false })
    render(<DevicesPanel />)
    await screen.findByText('Old iPhone')
    api.listDevices.mockResolvedValueOnce({ devices: [], current_device_known: false })
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Signed out of Old iPhone.'))
    expect(auth.logout).not.toHaveBeenCalled()
    await waitFor(() => expect(api.listDevices).toHaveBeenCalledTimes(2))
  })

  it('shows "Signing out…" on the row being signed out, and toasts on failure', async () => {
    api.listDevices.mockResolvedValue({
      devices: [device({ id: 'd1' })],
      current_device_known: false,
    })
    api.signOutDevice.mockRejectedValue(new Error('boom'))
    render(<DevicesPanel />)
    const btn = await screen.findByRole('button', { name: 'Sign out' })
    fireEvent.click(btn)
    expect(await screen.findByRole('button', { name: 'Signing out…' })).toBeInTheDocument()
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("Couldn't sign that device out. Try again."))
  })

  it('signs out every other device and reloads on success', async () => {
    api.listDevices.mockResolvedValueOnce({
      devices: [device({ id: 'd0', is_current: true }), device({ id: 'd1' })],
      current_device_known: true,
    })
    api.signOutOtherDevices.mockResolvedValue({ message: 'Signed out', sessions_revoked: 3 })
    render(<DevicesPanel />)
    await screen.findByText('Everywhere else')
    api.listDevices.mockResolvedValueOnce({
      devices: [device({ id: 'd0', is_current: true })],
      current_device_known: true,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign out of all other devices' }))
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Signed out of every other device.'))
    await waitFor(() => expect(api.listDevices).toHaveBeenCalledTimes(2))
  })

  it('surfaces the server message on a 409 current_device_unknown refusal', async () => {
    api.listDevices.mockResolvedValue({
      devices: [device({ id: 'd0', is_current: true }), device({ id: 'd1' })],
      current_device_known: true,
    })
    api.signOutOtherDevices.mockRejectedValue({
      status: 409,
      data: { code: 'current_device_unknown', error: "This browser isn't recognised yet. Sign in again on it, then try again." },
    })
    render(<DevicesPanel />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out of all other devices' }))
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        "This browser isn't recognised yet. Sign in again on it, then try again.",
      ),
    )
  })

  it('shows the loading skeleton before the fetch settles', () => {
    api.listDevices.mockReturnValue(new Promise(() => {}))
    render(<DevicesPanel />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('names the failed load, distinct from empty', async () => {
    api.listDevices.mockRejectedValue(new Error('boom'))
    render(<DevicesPanel />)
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your devices")
    expect(screen.queryByText('No devices')).not.toBeInTheDocument()
  })

  it('renders the empty state in-frame', async () => {
    api.listDevices.mockResolvedValue({ devices: [], current_device_known: false })
    render(<DevicesPanel />)
    expect(await screen.findByText('No devices')).toBeInTheDocument()
    expect(screen.getByText('Signing in adds one.')).toBeInTheDocument()
  })
})
