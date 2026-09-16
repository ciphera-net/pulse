import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'fs'
import { join } from 'path'
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
  it('renders both panel titles once their fetch resolves', async () => {
    mockGetDevices.mockResolvedValue({ devices: [] })
    mockGetActivity.mockResolvedValue(activityResp([]))
    render(<AccountDevicesTab />)
    // Panel titles land only once the section has loaded (populated or
    // empty share the same SettingsPanel frame, so the title is not shown
    // until the loading skeleton is gone — spec §2/§6, finding 1).
    expect(await screen.findByText('Trusted devices')).toBeInTheDocument()
    expect(screen.getByText('Security activity')).toBeInTheDocument()
    // Fetches fire on mount.
    expect(mockGetDevices).toHaveBeenCalled()
    expect(mockGetActivity).toHaveBeenCalledWith(20, 0)
  })

  it('renders both panel titles as sentence-case level-2 headings', async () => {
    mockGetDevices.mockResolvedValue({ devices: [] })
    mockGetActivity.mockResolvedValue(activityResp([]))
    render(<AccountDevicesTab />)
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Trusted devices' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Security activity' }),
    ).toBeInTheDocument()
  })

  it('shows the loading skeleton (role=status) for both cards before the fetches settle', () => {
    // Promises that never resolve: the assertion below runs before any
    // microtask fires, so both cards are still on their initial `loading`
    // state — SettingsLoadingState, never a bare spinner.
    mockGetDevices.mockReturnValue(new Promise(() => {}))
    mockGetActivity.mockReturnValue(new Promise(() => {}))
    render(<AccountDevicesTab />)
    expect(screen.getAllByRole('status')).toHaveLength(2)
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
    const thisDeviceChip = screen.getByText('This device')
    expect(thisDeviceChip).toBeInTheDocument()
    // A label, not a state: no dot (finding — a revoked/failed state gets
    // one, a plain "this is you" label does not).
    expect(thisDeviceChip.querySelector('.rounded-full')).toBeFalsy()
    // The current device has no Remove; the other one always shows it (no
    // hover-only reveal) and is enabled.
    const remove = screen.getByRole('button', { name: 'Remove' }) as HTMLButtonElement
    expect(remove).toBeInTheDocument()
    expect(remove.disabled).toBe(false)
  })

  it('shows First seen as a relative date with the absolute date as a tooltip', async () => {
    mockGetDevices.mockResolvedValue({
      devices: [device({ id: 'd1', display_hint: 'Chrome on macOS', first_seen_at: '2026-05-05T10:00:00Z' })],
    })
    mockGetActivity.mockResolvedValue(activityResp([]))
    render(<AccountDevicesTab />)

    await screen.findByText('Chrome on macOS')
    // Relative, not the full "Fri, 05/05/2026 06:00" string (the tab's data
    // flow, not chrome, so this pass keeps the pre-existing format).
    const firstSeen = screen.getByText('05/05')
    expect(firstSeen).toBeInTheDocument()
    // The absolute instant still reaches the reader, via the tooltip.
    expect(firstSeen).toHaveAttribute('title', expect.stringContaining('05/05/2026'))
  })

  it('renders the device empty state in-frame (not error)', async () => {
    mockGetDevices.mockResolvedValue({ devices: [] })
    mockGetActivity.mockResolvedValue(activityResp([]))
    render(<AccountDevicesTab />)
    expect(await screen.findByText('No trusted devices yet')).toBeInTheDocument()
  })

  it('surfaces a device fetch error distinctly from empty, naming the thing that failed', async () => {
    mockGetDevices.mockRejectedValue(new Error('boom'))
    mockGetActivity.mockResolvedValue(activityResp([]))
    render(<AccountDevicesTab />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't load your trusted devices")
    expect(alert).toHaveTextContent('boom')
    expect(screen.queryByText('No trusted devices yet')).not.toBeInTheDocument()
  })

  it('surfaces an activity fetch error distinctly from empty, naming the thing that failed', async () => {
    mockGetDevices.mockResolvedValue({ devices: [] })
    mockGetActivity.mockRejectedValue(new Error('kaboom'))
    render(<AccountDevicesTab />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Couldn't load your security activity")
    expect(alert).toHaveTextContent('kaboom')
    expect(screen.queryByText('No security activity yet')).not.toBeInTheDocument()
  })

  it('renders activity as a ruled table: date group, Failed chip, the method as a plain word', async () => {
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
    // Sentence-case date-group header for same-day events, and it is a body
    // row (rule 9 reserves text-micro-label for a table header or a kbd).
    const dayGroup = screen.getByText('Today')
    expect(dayGroup).toBeInTheDocument()
    expect(dayGroup.className).not.toMatch(/text-micro-label|uppercase/)
    // Failure is a genuine danger signal → keeps its chip, and it is a real
    // state (not a label), so it carries a dot.
    const failedChip = screen.getByText('Failed')
    expect(failedChip).toBeInTheDocument()
    expect(failedChip.querySelector('.rounded-full')).toBeTruthy()
    // The auth method is demoted to inline mono metadata, not a StatusChip,
    // and carries no arbitrary tracking value (rule 9: scale values only).
    // ...and as a sentence-case word in the caption: never a chip, never small caps.
    const methodLabels = screen.getAllByText('Opaque')
    expect(methodLabels.length).toBeGreaterThan(0)
    expect(methodLabels[0].className).not.toMatch(/tracking-\[|uppercase|micro-label/)
    // Failure reason survives.
    expect(screen.getByText('Wrong password')).toBeInTheDocument()
  })

  it('sentence-cases an unknown event type instead of leaking the raw key', async () => {
    mockGetDevices.mockResolvedValue({ devices: [] })
    mockGetActivity.mockResolvedValue(
      activityResp([event({ id: 'e9', event_type: 'refresh_token_reuse_benign', metadata: {} })]),
    )
    render(<AccountDevicesTab />)
    expect(await screen.findByText('Refresh token reuse benign')).toBeInTheDocument()
  })

  it('shows the event count with a thousands separator, not in parentheses', async () => {
    mockGetDevices.mockResolvedValue({ devices: [] })
    mockGetActivity.mockResolvedValue({
      entries: [event()],
      total_count: 1579,
      has_more: false,
      limit: 20,
      offset: 0,
    })
    render(<AccountDevicesTab />)
    await screen.findByText('Sign in')
    expect(screen.getByText('1,579 events on your account.')).toBeInTheDocument()
    expect(screen.queryByText(/\(1579\)/)).not.toBeInTheDocument()
  })
})

// --- Copy: no dashes anywhere in this tab's source, comments stripped ----
// Mechanical companion to the manual `grep -n "—\|–"` pass rule 15 requires:
// strips // and /* */ comments, then asserts neither dash character remains
// in what's left (labels, captions, toasts, JSX text). The literal "..."
// check is done by hand instead of here, because a stripped source file
// still legitimately contains JS spread syntax ({...props}).
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

describe('copy: no em dash or en dash in source (comments stripped)', () => {
  const files = [
    '../AccountDevicesTab.tsx',
    '../../../TrustedDevicesCard.tsx',
    '../../../SecurityActivityCard.tsx',
  ]

  it.each(files)('%s has no dash left once comments are stripped', (relPath) => {
    const source = readFileSync(join(__dirname, relPath), 'utf8')
    expect(stripComments(source)).not.toMatch(/[—–]/)
  })
})
