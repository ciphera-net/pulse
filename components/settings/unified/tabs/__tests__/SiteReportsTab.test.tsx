import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReportSchedule } from '@/lib/api/report-schedules'

// --- Mocks ---------------------------------------------------------------

let mockCanManage = true
vi.mock('@/lib/auth/permissions', () => ({
  useCan: () => mockCanManage,
}))

const useAlertSchedules = vi.fn()
const useSite = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({
  useAlertSchedules: (...a: unknown[]) => useAlertSchedules(...a),
  useSite: (...a: unknown[]) => useSite(...a),
}))

const createReportSchedule = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/api/report-schedules', () => ({
  createReportSchedule: (...a: unknown[]) => createReportSchedule(...a),
  updateReportSchedule: vi.fn().mockResolvedValue(undefined),
  deleteReportSchedule: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/cdn', () => ({ cdnUrl: (p: string) => p }))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: any) => <>{children}</>,
  TooltipContent: ({ children }: any) => <>{children}</>,
  TooltipProvider: ({ children }: any) => <>{children}</>,
  TooltipTrigger: ({ children }: any) => <>{children}</>,
}))

vi.mock('@/components/ui/ConfirmDialog', () => ({ ConfirmDialog: () => null }))

vi.mock('@ciphera-net/facet', () => ({
  // `@/lib/utils` (and the real panel primitives) re-export cn from facet.
  cn: (...args: any[]) => args.flat(Infinity).filter(Boolean).join(' '),
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Input: (props: any) => <input {...props} />,
  Modal: ({ isOpen, title, children }: any) =>
    isOpen ? <div role="dialog">{title}{children}</div> : null,
  Spinner: () => <span>loading</span>,
  toast: { success: vi.fn(), error: vi.fn() },
  getAuthErrorMessage: () => 'error',
}))

import SiteReportsTab from '../SiteReportsTab'

const alertChannel: ReportSchedule = {
  id: 'a1', site_id: 's1', organization_id: 'o1', channel: 'email',
  channel_config: { recipients: ['ops@example.com', 'cto@example.com'] },
  frequency: 'daily', report_type: 'summary', purpose: 'alert',
  enabled: true, send_hour: 9, send_day: null, timezone: 'UTC',
  last_sent_at: null, last_error: null, next_send_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}

// The list endpoint returns disabled channels too (they must not vanish from
// the settings UI just because they are paused).
const pausedChannel: ReportSchedule = {
  ...alertChannel, id: 'a2', enabled: false,
  channel_config: { recipients: ['standby@example.com'] },
}

function swrState<T>(data: T[], over: Record<string, unknown> = {}) {
  return { data, mutate: vi.fn(), isLoading: false, isValidating: false, error: undefined, ...over }
}

beforeEach(() => {
  mockCanManage = true
  useAlertSchedules.mockReset().mockReturnValue(swrState([alertChannel, pausedChannel]))
  useSite.mockReset().mockReturnValue({ data: { timezone: 'UTC' } })
  createReportSchedule.mockClear()
})

describe('SiteReportsTab (alert channels)', () => {
  it('renders the alert panel with channel rows, including paused ones', () => {
    render(<SiteReportsTab siteId="s1" />)
    expect(screen.getByText('Alert channels')).toBeInTheDocument()
    // The report surface is gone.
    expect(screen.queryByText('Scheduled reports')).toBeNull()
    expect(screen.queryByRole('button', { name: /Add report/i })).toBeNull()
    // Row identity: primary recipient + the "+N more" affordance.
    expect(screen.getByText('ops@example.com')).toBeInTheDocument()
    expect(screen.getByText('+1 more')).toBeInTheDocument()
    // A paused channel still renders, with its neutral chip.
    expect(screen.getByText('standby@example.com')).toBeInTheDocument()
    expect(screen.getByText('Paused')).toBeInTheDocument()
  })

  it('shows always-visible row actions (no hover-only reveal, no Send test)', () => {
    render(<SiteReportsTab siteId="s1" />)
    const del = screen.getAllByLabelText('Delete')[0]
    expect(del.className).not.toMatch(/opacity-0/)
    expect(screen.getAllByLabelText('Edit').length).toBe(2)
    // The test-send action died with the report surface.
    expect(screen.queryByLabelText('Send test')).toBeNull()
    // Enabled channel shows Pause; the paused one shows Enable.
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enable' })).toBeInTheDocument()
  })

  it('renders the in-frame empty state (EmptyRow) when there are no channels', () => {
    useAlertSchedules.mockReturnValue(swrState([]))
    render(<SiteReportsTab siteId="s1" />)
    expect(screen.getByText('No alert channels yet')).toBeInTheDocument()
  })

  it('surfaces a distinct error state (error ≠ empty) when the fetch fails', () => {
    useAlertSchedules.mockReturnValue(swrState([], { error: new Error('boom') }))
    render(<SiteReportsTab siteId="s1" />)
    expect(screen.getByText(/couldn't load your alert channels/i)).toBeInTheDocument()
    // Not silently rendered as the empty state.
    expect(screen.queryByText('No alert channels yet')).toBeNull()
  })

  it("creates a channel with purpose 'alert' — the API contract the backend keys on", async () => {
    useAlertSchedules.mockReturnValue(swrState([]))
    render(<SiteReportsTab siteId="s1" />)
    fireEvent.click(screen.getAllByRole('button', { name: /Add channel/i })[0])
    expect(screen.getByText('New Alert Channel')).toBeInTheDocument()
    fireEvent.change(document.getElementById('alert-recipients')!, {
      target: { value: 'oncall@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Channel' }))
    await waitFor(() => expect(createReportSchedule).toHaveBeenCalledTimes(1))
    expect(createReportSchedule).toHaveBeenCalledWith('s1', expect.objectContaining({
      purpose: 'alert',
      channel: 'email',
      channel_config: { recipients: ['oncall@example.com'] },
    }))
  })

  it('hides the CTAs and all row actions when the user cannot manage', () => {
    mockCanManage = false
    render(<SiteReportsTab siteId="s1" />)
    expect(screen.queryByRole('button', { name: /Add channel/i })).toBeNull()
    expect(screen.queryByLabelText('Delete')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull()
  })
})
