import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { TrustedDevice } from '@/lib/api/devices'
import type { AuditLogEntry } from '@/lib/api/activity'
import * as devicesApi from '@/lib/api/devices'
import * as activityApi from '@/lib/api/activity'

// --- Mocks ---------------------------------------------------------------

vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'ada@ciphera.net' } }),
}))

vi.mock('@/lib/api/devices', () => ({
  getUserDevices: vi.fn(),
  removeDevice: vi.fn(),
}))

vi.mock('@/lib/api/activity', () => ({
  getUserActivity: vi.fn(),
}))

// Lightweight facet stand-ins (audit/billing test precedent): the RuledTable
// family renders real DOM so the ruled-row composition, the always-visible
// Remove action, and the demoted mono metadata stay queryable, while
// StatusChip / SettingsPanel / EmptyRow render for real.
vi.mock('@ciphera-net/facet', () => ({
  cn: (...a: unknown[]) => a.filter(Boolean).join(' '),
  Button: ({ children, variant, size, ...props }: any) => <button {...props}>{children}</button>,
  toast: { success: vi.fn(), error: vi.fn() },
  getAuthErrorMessage: () => 'error',
  Table: ({ children, containerClassName, ...props }: any) => <table {...props}>{children}</table>,
  THead: ({ children, ...props }: any) => <thead {...props}>{children}</thead>,
  TBody: ({ children, ...props }: any) => <tbody {...props}>{children}</tbody>,
  TR: ({ children, ...props }: any) => <tr {...props}>{children}</tr>,
  TH: ({ children, numeric, ...props }: any) => <th {...props}>{children}</th>,
  TD: ({ children, numeric, ...props }: any) => <td {...props}>{children}</td>,
}))

import AccountDevicesTab from '../AccountDevicesTab'

const mockGetDevices = devicesApi.getUserDevices as unknown as ReturnType<typeof vi.fn>
const mockGetActivity = activityApi.getUserActivity as unknown as ReturnType<typeof vi.fn>

const device = (over: Partial<TrustedDevice> = {}): TrustedDevice => ({
  id: 'd1',
  display_hint: 'Chrome on macOS',
  first_seen_at: '2026-05-05T10:00:00Z',
  last_seen_at: new Date().toISOString(),
  is_current: false,
  ...over,
})

const event = (over: Partial<AuditLogEntry> = {}): AuditLogEntry => ({
  id: 'e1',
  created_at: new Date().toISOString(),
  event_type: 'login_success',
  outcome: 'success',
  ip_address: '203.0.113.7',
  user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120',
  metadata: { method: 'opaque' },
  ...over,
})

const activityResp = (entries: AuditLogEntry[]) => ({
  entries,
  total_count: entries.length,
  has_more: false,
  limit: 20,
  offset: 0,
})

beforeEach(() => {
  mockGetDevices.mockReset()
  mockGetActivity.mockReset()
})

describe('AccountDevicesTab (Facet ruled lists)', () => {
  it('renders both section headers', async () => {
    mockGetDevices.mockResolvedValue({ devices: [] })
    mockGetActivity.mockResolvedValue(activityResp([]))
    render(<AccountDevicesTab />)
    expect(screen.getByText('Trusted devices')).toBeInTheDocument()
    expect(screen.getByText('Security activity')).toBeInTheDocument()
    // Fetches fire on mount.
    expect(mockGetDevices).toHaveBeenCalled()
    expect(mockGetActivity).toHaveBeenCalledWith(20, 0)
  })

  it('shows a neutral "This device" chip and an always-visible Remove for other devices', async () => {
    mockGetDevices.mockResolvedValue({
      devices: [
        device({ id: 'd0', display_hint: 'This laptop', is_current: true }),
        device({ id: 'd1', display_hint: 'Old iPhone', is_current: false }),
      ],
    })
    mockGetActivity.mockResolvedValue(activityResp([]))
    render(<AccountDevicesTab />)

    await screen.findByText('This laptop')
    expect(screen.getByText('This device')).toBeInTheDocument()
    // The current device has no Remove; the other one always shows it (no
    // hover-only reveal) and is enabled.
    const remove = screen.getByRole('button', { name: 'Remove' }) as HTMLButtonElement
    expect(remove).toBeInTheDocument()
    expect(remove.disabled).toBe(false)
  })

  it('renders the device empty state in-frame (not error)', async () => {
    mockGetDevices.mockResolvedValue({ devices: [] })
    mockGetActivity.mockResolvedValue(activityResp([]))
    render(<AccountDevicesTab />)
    expect(await screen.findByText('No trusted devices yet')).toBeInTheDocument()
  })

  it('surfaces a device fetch error distinctly from empty', async () => {
    mockGetDevices.mockRejectedValue(new Error('boom'))
    mockGetActivity.mockResolvedValue(activityResp([]))
    render(<AccountDevicesTab />)
    expect(await screen.findByText('boom')).toBeInTheDocument()
    expect(screen.queryByText('No trusted devices yet')).not.toBeInTheDocument()
  })

  it('renders activity as a ruled table: date group, Failed chip, demoted mono method', async () => {
    mockGetDevices.mockResolvedValue({ devices: [] })
    mockGetActivity.mockResolvedValue(
      activityResp([
        event({ id: 'e1', event_type: 'login_success', metadata: { method: 'opaque' } }),
        event({
          id: 'e2',
          event_type: 'login_failure',
          outcome: 'failure',
          metadata: { method: 'opaque', reason: 'invalid_password' },
        }),
      ]),
    )
    render(<AccountDevicesTab />)

    await screen.findByText('Sign in')
    // Mono date-group header for same-day events.
    expect(screen.getByText('TODAY')).toBeInTheDocument()
    // Failure is a genuine danger signal → keeps its chip.
    expect(screen.getByText('Failed')).toBeInTheDocument()
    // The auth method is demoted to inline mono metadata, not a StatusChip.
    expect(screen.getAllByText('opaque').length).toBeGreaterThan(0)
    // Failure reason survives.
    expect(screen.getByText('Wrong password')).toBeInTheDocument()
  })
})
