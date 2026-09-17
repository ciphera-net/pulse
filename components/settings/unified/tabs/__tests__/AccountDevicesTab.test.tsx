import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { TrustedDevice } from '@/lib/api/devices'
import type { AuditLogEntry } from '@/lib/api/activity'
import * as devicesApi from '@/lib/api/devices'
import * as activityApi from '@/lib/api/activity'

// --- Mocks ---------------------------------------------------------------

// A stable `user` reference, not a fresh object literal per call: the real
// AuthProvider holds `user` in useState, so it keeps its identity across
// re-renders that don't touch auth. A mock that hands back a new object every
// call diverges from that and re-triggers TrustedDevicesCard's `[user,
// fetchDevices]` effect on every unrelated re-render (e.g. opening the
// confirm dialog), which reloads the full device list mid-interaction and
// starves any test that removes a device.
const authUser = vi.hoisted(() => ({ id: 'u1', email: 'ada@ciphera.net' }))

vi.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ user: authUser }),
}))

vi.mock('@/lib/api/devices', () => ({
  getUserDevices: vi.fn(),
  removeDevice: vi.fn(),
}))

vi.mock('@/lib/api/activity', () => ({
  getUserActivity: vi.fn(),
}))

// House pattern for a framer-motion consumer under jsdom (precedent:
// WorkspaceAuditTab.test.tsx / PasskeysPanel.test.tsx): real useReducedMotion()
// reads window.matchMedia, which jsdom does not implement, so it is stubbed to
// `false` and motion.* strips framer-only props while passing the rest
// (className, data-testid included) straight through. Unlike the other
// precedents, this page's motion element is `motion.tr` inside a real
// `<table>`, so the stand-in renders the SAME tag the Proxy key names
// (`createElement(tag, ...)`) rather than always a `<div>`: a `<div>` nested
// in `<tbody>` is invalid markup that only masks the real row structure.
vi.mock('framer-motion', () => ({
  useReducedMotion: () => false,
  motion: new Proxy(
    {},
    {
      get:
        (_target: unknown, tag: string) =>
        ({ children, initial, animate, exit, transition, layout, ...props }: any) =>
          createElement(tag, props, children),
    },
  ),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

vi.mock('@/components/ui/ConfirmDialog', () => ({
  ConfirmDialog: ({ open, title, confirmLabel, onConfirm }: any) =>
    open ? <div role="dialog" aria-label={title}><button onClick={onConfirm}>{confirmLabel}</button></div> : null,
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
const mockRemoveDevice = devicesApi.removeDevice as unknown as ReturnType<typeof vi.fn>
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
  mockRemoveDevice.mockReset()
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

  it('keeps the device Remove action quiet at rest, red only on hover (P10)', async () => {
    mockGetDevices.mockResolvedValue({
      devices: [device({ id: 'd1', display_hint: 'Old iPhone', is_current: false })],
    })
    mockGetActivity.mockResolvedValue(activityResp([]))
    render(<AccountDevicesTab />)

    const remove = await screen.findByRole('button', { name: 'Remove' })
    // Quiet ghost rung: muted at rest, destructive only on hover, on the
    // house 150ms ease-apple curve, not a standing destructive colour that
    // paints every row red before the pointer ever reaches it.
    expect(remove.className).toContain('text-muted-foreground')
    expect(remove.className).toContain('hover:text-destructive')
    expect(remove.className).not.toMatch(/(?<!hover:)text-destructive/)
    expect(remove.className).toContain('duration-fast')
    expect(remove.className).toContain('ease-apple')
  })

  it('exits a removed device row through its own animatable element (M5)', async () => {
    mockGetDevices.mockResolvedValue({
      devices: [
        device({ id: 'd0', display_hint: 'This laptop', is_current: true }),
        device({ id: 'd1', display_hint: 'Old iPhone', is_current: false }),
      ],
    })
    mockGetActivity.mockResolvedValue(activityResp([]))
    mockRemoveDevice.mockResolvedValue(undefined)
    render(<AccountDevicesTab />)

    await screen.findByText('Old iPhone')
    // Each row is its own keyed, animatable unit (AnimatePresence + motion.tr)
    // so a single removal can exit on its own rather than the whole table
    // re-rendering with no transition.
    expect(screen.getByTestId('device-row-d1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Remove device' })).getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(mockRemoveDevice).toHaveBeenCalledWith('d1'))
    await waitFor(() => expect(screen.queryByTestId('device-row-d1')).not.toBeInTheDocument())
    // The current device's row survives the removal.
    expect(screen.getByTestId('device-row-d0')).toBeInTheDocument()
  })

  it('shows First seen as the calendar date, with the full instant as a tooltip', async () => {
    mockGetDevices.mockResolvedValue({
      devices: [device({ id: 'd1', display_hint: 'Chrome on macOS', first_seen_at: '2026-05-05T10:00:00Z' })],
    })
    mockGetActivity.mockResolvedValue(activityResp([]))
    render(<AccountDevicesTab />)

    await screen.findByText('Chrome on macOS')
    // One format per column: first seen is a fixed fact and renders as the
    // calendar date, never relative. Relative in both columns read as
    // "5h ago / 25/08 / 1d ago" down one column on staging (16-09-2026).
    const firstSeen = screen.getByText('05/05/2026')
    expect(firstSeen).toBeInTheDocument()
    // The full instant still reaches the reader, via the tooltip.
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
