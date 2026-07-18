import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MastheadSlotProvider } from '@/components/settings/shell-slots'
import type { ReportSchedule } from '@/lib/api/report-schedules'

// --- Mocks ---------------------------------------------------------------

let mockCanManage = true
vi.mock('@/lib/auth/permissions', () => ({
  useCan: () => mockCanManage,
}))

const useReportSchedules = vi.fn()
const useAlertSchedules = vi.fn()
const useSite = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({
  useReportSchedules: (...a: unknown[]) => useReportSchedules(...a),
  useAlertSchedules: (...a: unknown[]) => useAlertSchedules(...a),
  useSite: (...a: unknown[]) => useSite(...a),
}))

const testReportSchedule = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/api/report-schedules', () => ({
  createReportSchedule: vi.fn().mockResolvedValue(undefined),
  updateReportSchedule: vi.fn().mockResolvedValue(undefined),
  deleteReportSchedule: vi.fn().mockResolvedValue(undefined),
  testReportSchedule: (...a: unknown[]) => testReportSchedule(...a),
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
  Select: ({ value, onChange, options = [], ...props }: any) => (
    <select value={value} onChange={(e) => onChange?.(e.target.value)} {...props}>
      {options.map((o: any) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  ),
  Modal: ({ isOpen, title, children }: any) =>
    isOpen ? <div role="dialog">{title}{children}</div> : null,
  Spinner: () => <span>loading</span>,
  toast: { success: vi.fn(), error: vi.fn() },
  getAuthErrorMessage: () => 'error',
}))

import SiteReportsTab from '../SiteReportsTab'

const report: ReportSchedule = {
  id: 'r1', site_id: 's1', organization_id: 'o1', channel: 'email',
  channel_config: { recipients: ['ops@example.com', 'cto@example.com'] },
  frequency: 'weekly', report_type: 'summary', purpose: 'report',
  enabled: true, send_hour: 9, send_day: 1, timezone: 'UTC',
  last_sent_at: null, last_error: null, next_send_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}

const pausedReport: ReportSchedule = {
  ...report, id: 'r2', enabled: false,
  channel_config: { recipients: ['weekly@example.com'] },
}

function swrState<T>(data: T[], over: Record<string, unknown> = {}) {
  return { data, mutate: vi.fn(), isLoading: false, isValidating: false, error: undefined, ...over }
}

function renderTab() {
  const slot = document.createElement('div')
  slot.setAttribute('data-testid', 'masthead-slot')
  document.body.appendChild(slot)
  return render(
    <MastheadSlotProvider value={slot}>
      <SiteReportsTab siteId="s1" />
    </MastheadSlotProvider>,
  )
}

beforeEach(() => {
  mockCanManage = true
  useReportSchedules.mockReset().mockReturnValue(swrState([report, pausedReport]))
  useAlertSchedules.mockReset().mockReturnValue(swrState([]))
  useSite.mockReset().mockReturnValue({ data: { timezone: 'UTC' } })
  testReportSchedule.mockClear()
  document.body.innerHTML = ''
})

describe('SiteReportsTab (Facet structured panels)', () => {
  it('renders both ruled panels and portals the Add report CTA into the masthead', () => {
    renderTab()
    expect(screen.getByText('Scheduled reports')).toBeInTheDocument()
    expect(screen.getByText('Alert channels')).toBeInTheDocument()
    // Row identity: primary recipient + the "+N more" affordance.
    expect(screen.getByText('ops@example.com')).toBeInTheDocument()
    expect(screen.getByText('+1 more')).toBeInTheDocument()
    // Paused schedule keeps its neutral chip.
    expect(screen.getByText('Paused')).toBeInTheDocument()
    const cta = screen.getByRole('button', { name: /Add report/i })
    expect(screen.getByTestId('masthead-slot').contains(cta)).toBe(true)
  })

  it('shows always-visible row actions (no hover-only reveal) including Pause/Enable', () => {
    renderTab()
    const del = screen.getAllByLabelText('Delete')[0]
    expect(del.className).not.toMatch(/opacity-0/)
    expect(screen.getAllByLabelText('Edit').length).toBe(2)
    expect(screen.getAllByLabelText('Send test').length).toBe(2)
    // Enabled report shows Pause; the paused one shows Enable.
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enable' })).toBeInTheDocument()
  })

  it('renders in-frame empty states (EmptyRow) when there are no schedules', () => {
    useReportSchedules.mockReturnValue(swrState([]))
    useAlertSchedules.mockReturnValue(swrState([]))
    renderTab()
    expect(screen.getByText('No scheduled reports yet')).toBeInTheDocument()
    expect(screen.getByText('No alert channels yet')).toBeInTheDocument()
  })

  it('surfaces a distinct error state (error ≠ empty) when a fetch fails', () => {
    useReportSchedules.mockReturnValue(swrState([], { error: new Error('boom') }))
    renderTab()
    expect(screen.getByText(/couldn't load your scheduled reports/i)).toBeInTheDocument()
    // Not silently rendered as the empty state.
    expect(screen.queryByText('No scheduled reports yet')).toBeNull()
  })

  it('opens the report modal from the masthead CTA', () => {
    renderTab()
    fireEvent.click(screen.getByRole('button', { name: /Add report/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('New Report Schedule')).toBeInTheDocument()
  })

  it('hides the CTAs and all row actions when the user cannot manage', () => {
    mockCanManage = false
    renderTab()
    expect(screen.queryByRole('button', { name: /Add report/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Add channel/i })).toBeNull()
    expect(screen.queryByLabelText('Delete')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull()
  })
})
