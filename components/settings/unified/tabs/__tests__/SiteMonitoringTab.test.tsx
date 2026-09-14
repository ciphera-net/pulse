import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// --- Mocks ---------------------------------------------------------------

let mockCanManage = true
vi.mock('@/lib/auth/permissions', () => ({
  useCan: () => mockCanManage,
}))

const useSite = vi.fn()
const useUptimeStatus = vi.fn()
const useUptimeIncidents = vi.fn()
const useInstallStatus = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({
  useSite: (...a: unknown[]) => useSite(...a),
  useUptimeStatus: (...a: unknown[]) => useUptimeStatus(...a),
  useUptimeIncidents: (...a: unknown[]) => useUptimeIncidents(...a),
  useInstallStatus: (...a: unknown[]) => useInstallStatus(...a),
}))

const updateSite = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/api/sites', () => ({
  updateSite: (...a: unknown[]) => updateSite(...a),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
}))

vi.mock('@ciphera-net/facet', () => ({
  cn: (...args: any[]) => args.flat().filter(Boolean).join(' '),
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  toast: { success: vi.fn(), error: vi.fn() },
  getAuthErrorMessage: () => '',
}))

import SiteMonitoringTab from '../SiteMonitoringTab'
import { toast } from '@ciphera-net/facet'

const mutate = vi.fn().mockResolvedValue(undefined)

function site(over: Record<string, unknown> = {}) {
  return {
    id: 's1', name: 'Example', domain: 'example.com', timezone: 'Europe/Brussels',
    is_public: false, excluded_paths: [], uptime_enabled: true, ...over,
  }
}
function monitor(over: Record<string, unknown> = {}) {
  return {
    id: 'm1', site_id: 's1', name: 'example.com', url: 'https://example.com',
    check_interval_seconds: 300, expected_status_code: 200, timeout_seconds: 30, enabled: true,
    last_checked_at: new Date(Date.now() - 40_000).toISOString(), last_status: 'up',
    last_response_time_ms: 182, tls_expires_at: null, tls_issuer: null, tls_checked_at: null,
    created_at: '', updated_at: '', ...over,
  }
}
function arm({
  siteOver = {}, mon = monitor(), uptimePct = 99.98, incidents = 0, install = { install_status: 'active', first_event_at: '2026-01-01T00:00:00Z', last_event_at: new Date(Date.now() - 4 * 60_000).toISOString() },
}: { siteOver?: Record<string, unknown>; mon?: ReturnType<typeof monitor> | null; uptimePct?: number; incidents?: number; install?: unknown } = {}) {
  useSite.mockReturnValue({ data: site(siteOver), error: undefined, mutate })
  useUptimeStatus.mockReturnValue({
    data: { monitors: mon ? [{ monitor: mon, daily_stats: [], overall_uptime: uptimePct }] : [], overall_uptime: uptimePct, status: 'operational', total_monitors: mon ? 1 : 0, utc_days_before: null, start_date: '', end_date: '' },
    error: undefined, mutate,
  })
  useUptimeIncidents.mockReturnValue({ data: { incidents: Array.from({ length: incidents }, (_, i) => ({ id: String(i) })), start_date: '', end_date: '' }, error: undefined })
  useInstallStatus.mockReturnValue({ data: install, error: undefined })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCanManage = true
})

describe('SiteMonitoringTab — Availability', () => {
  it('renders the one monitor with its live state, this month\'s uptime and incidents, and links to the uptime page', () => {
    arm({ incidents: 2 })
    render(<SiteMonitoringTab siteId="s1" />)
    expect(screen.getByText('https://example.com')).toBeInTheDocument()
    expect(screen.getByText('HTTPS · every 5 min')).toBeInTheDocument()
    expect(screen.getByText('Up')).toBeInTheDocument()
    expect(screen.getByText(/99\.98% this month/)).toBeInTheDocument()
    expect(screen.getByText(/2 incidents this month/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /View uptime/ })).toHaveAttribute('href', '/sites/s1/uptime')
  })

  it('asks for the SITE\'s calendar month, not the viewer\'s, and null-keys the reads while monitoring is off', () => {
    arm()
    render(<SiteMonitoringTab siteId="s1" />)
    const [, start, end] = useUptimeStatus.mock.calls[0]
    expect(start).toMatch(/^\d{4}-\d{2}-01$/)
    expect(end).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    vi.clearAllMocks()
    arm({ siteOver: { uptime_enabled: false } })
    render(<SiteMonitoringTab siteId="s1" />)
    expect(useUptimeStatus.mock.calls[0][1]).toBeUndefined()
    expect(useUptimeIncidents.mock.calls[0][1]).toBe('')
  })

  it('a monitor with no check yet is "Waiting for the first check", never "Up"', () => {
    arm({ mon: monitor({ last_status: 'unknown', last_checked_at: null, last_response_time_ms: null }) })
    render(<SiteMonitoringTab siteId="s1" />)
    expect(screen.getByText('Waiting for the first check')).toBeInTheDocument()
    expect(screen.queryByText('Up')).not.toBeInTheDocument()
    expect(screen.queryByText(/this month/)).not.toBeInTheDocument()
  })

  it('off + uptime.manage: the empty row offers Enable, and enabling sends the whole-site PUT with uptime_enabled true', async () => {
    arm({ siteOver: { uptime_enabled: false } })
    render(<SiteMonitoringTab siteId="s1" />)
    expect(screen.getByText('Uptime monitoring is off')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Enable uptime monitoring' }))
    await waitFor(() => expect(updateSite).toHaveBeenCalledWith('s1', expect.objectContaining({ name: 'Example', uptime_enabled: true })))
    expect(toast.success).toHaveBeenCalledWith('Uptime monitoring enabled')
  })

  it('off without uptime.manage: no button, and the line says who can', () => {
    mockCanManage = false
    arm({ siteOver: { uptime_enabled: false } })
    render(<SiteMonitoringTab siteId="s1" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('An owner or admin can enable it.')).toBeInTheDocument()
  })

  it('on + uptime.manage: Disable monitoring sends uptime_enabled false; a refusal is shown, not swallowed', async () => {
    arm()
    updateSite.mockRejectedValueOnce(new Error('forbidden'))
    render(<SiteMonitoringTab siteId="s1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Disable monitoring' }))
    await waitFor(() => expect(updateSite).toHaveBeenCalledWith('s1', expect.objectContaining({ uptime_enabled: false })))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
  })
})

describe('SiteMonitoringTab — Tracking', () => {
  it.each([
    ['active', 'Receiving data'],
    ['stalled', 'No recent data'],
    ['never_installed', 'No data yet'],
  ])('install_status %s renders "%s"', (status, label) => {
    arm({ install: { install_status: status, first_event_at: status === 'never_installed' ? null : '2026-01-01T00:00:00Z', last_event_at: status === 'never_installed' ? null : new Date().toISOString() } })
    render(<SiteMonitoringTab siteId="s1" />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('an unresolved install read is an em dash, never "No data yet"', () => {
    arm()
    // Explicitly unresolved — passing `undefined` to arm() would take its
    // default (an active install), which is exactly the false-green this
    // test exists to rule out.
    useInstallStatus.mockReturnValue({ data: undefined, error: undefined })
    render(<SiteMonitoringTab siteId="s1" />)
    expect(screen.queryByText('No data yet')).not.toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('renders NO switch anywhere — Phase 1 draws no control that controls nothing', () => {
    arm()
    render(<SiteMonitoringTab siteId="s1" />)
    expect(screen.queryAllByRole('switch')).toHaveLength(0)
    expect(screen.queryByText(/Rejected events/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Traffic/)).not.toBeInTheDocument()
  })

  it('names the delivery route and links to Notifications without editing it', () => {
    arm()
    render(<SiteMonitoringTab siteId="s1" />)
    expect(screen.getByText(/Monitoring category in your notification settings/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Notification settings/ })).toHaveAttribute('href', '/settings/account/notifications')
  })
})

describe('SiteMonitoringTab — fetch states', () => {
  it('a failed site read is a visible failure with a retry', () => {
    useSite.mockReturnValue({ data: undefined, error: new Error('boom'), mutate })
    useUptimeStatus.mockReturnValue({ data: undefined, error: undefined, mutate })
    useUptimeIncidents.mockReturnValue({ data: undefined, error: undefined })
    useInstallStatus.mockReturnValue({ data: undefined, error: undefined })
    render(<SiteMonitoringTab siteId="s1" />)
    expect(screen.getByText("Couldn't load this site")).toBeInTheDocument()
  })
})
