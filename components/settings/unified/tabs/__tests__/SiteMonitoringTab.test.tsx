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
const useIngestHealth = vi.fn()
const useTrafficStatus = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({
  useSite: (...a: unknown[]) => useSite(...a),
  useUptimeStatus: (...a: unknown[]) => useUptimeStatus(...a),
  useUptimeIncidents: (...a: unknown[]) => useUptimeIncidents(...a),
  useInstallStatus: (...a: unknown[]) => useInstallStatus(...a),
  useIngestHealth: (...a: unknown[]) => useIngestHealth(...a),
  useTrafficStatus: (...a: unknown[]) => useTrafficStatus(...a),
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

import SiteMonitoringTab, { monthSummary } from '../SiteMonitoringTab'
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
  ingest = { rejected_last_7d: false, causes: [] },
  // 🔴 `null` means UNRESOLVED here, not `undefined`. A destructuring default
  // fires precisely FOR `undefined`, so `arm({ traffic: undefined })` would
  // silently substitute the fixture below — a test reading "unresolved" while
  // asserting the opposite. Caught by the em-dash test failing on 16-09-2026.
  traffic = { state: 'unwatched', reason: 'session_boundary', watching_from: '2026-09-30', observed: null, expected: null } as unknown,
  trafficError = undefined,
}: { siteOver?: Record<string, unknown>; mon?: ReturnType<typeof monitor> | null; uptimePct?: number; incidents?: number; install?: unknown; ingest?: unknown; traffic?: unknown; trafficError?: unknown } = {}) {
  useSite.mockReturnValue({ data: site(siteOver), error: undefined, mutate })
  useUptimeStatus.mockReturnValue({
    data: { monitors: mon ? [{ monitor: mon, daily_stats: [], overall_uptime: uptimePct }] : [], overall_uptime: uptimePct, status: 'operational', total_monitors: mon ? 1 : 0, utc_days_before: null, start_date: '', end_date: '' },
    error: undefined, mutate,
  })
  useUptimeIncidents.mockReturnValue({ data: { incidents: Array.from({ length: incidents }, (_, i) => ({ id: String(i) })), start_date: '', end_date: '' }, error: undefined })
  useInstallStatus.mockReturnValue({ data: install, error: undefined })
  useIngestHealth.mockReturnValue({ data: ingest, error: undefined })
  useTrafficStatus.mockReturnValue({ data: traffic === null ? undefined : traffic, error: trafficError })
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
    // W1: one clause on its own line, and "this month" said once — not two
    // sibling spans each opening with a separator.
    expect(screen.getByText('99.98% this month, 2 incidents')).toBeInTheDocument()
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

  it('renders NO switch anywhere — the tab draws no control that controls nothing', () => {
    arm()
    render(<SiteMonitoringTab siteId="s1" />)
    expect(screen.queryAllByRole('switch')).toHaveLength(0)
    // ⏱ This used to also assert the TRAFFIC panel was ABSENT, which was true
    // while its type keys were retired and unemittable at the database. Phases
    // 4-5 registered new keys and the panel shipped on 16-09-2026 (direction
    // T1), so the absence assertion is gone — but the property it was bundled
    // with is NOT: the traffic panel is read-only too, and adding a switch to it
    // would pass a test that only counted the other panels' switches. The
    // queryAllByRole above covers the whole tab, which is why it is the
    // assertion that matters here.
  })

  it('names the delivery route and links to Notifications without editing it', () => {
    arm()
    render(<SiteMonitoringTab siteId="s1" />)
    expect(screen.getByText(/Monitoring category in your notification settings/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Notification settings/ })).toHaveAttribute('href', '/settings/account/notifications')
  })
})

describe('SiteMonitoringTab — Rejected events (Phase 2b, direction A)', () => {
  it('quiet: ONE neutral chip, and it is not the success tone — the row reports an absence of trouble', () => {
    arm({ ingest: { rejected_last_7d: false, causes: [] } })
    render(<SiteMonitoringTab siteId="s1" />)
    const chip = screen.getByText('All events counted')
    expect(chip).toBeInTheDocument()
    // Neutral, not green. A green chip here would read as an achievement.
    expect(chip.className).toContain('text-neutral-300')
    expect(chip.className).not.toContain('text-pos')
  })

  it('rejected: the chip plus the causes as plain muted text, in the published order', () => {
    arm({ ingest: { rejected_last_7d: true, causes: ['plan_ceiling', 'outdated_script'] } })
    render(<SiteMonitoringTab siteId="s1" />)
    expect(screen.getByText('Some events rejected')).toBeInTheDocument()
    expect(screen.getByText('plan ceiling, outdated script')).toBeInTheDocument()
    expect(screen.queryByText('All events counted')).not.toBeInTheDocument()
  })

  it('all three causes read in customer words, never a drop-reason slug', () => {
    arm({ ingest: { rejected_last_7d: true, causes: ['plan_ceiling', 'rate_limited', 'outdated_script'] } })
    render(<SiteMonitoringTab siteId="s1" />)
    expect(screen.getByText('plan ceiling, rate limited, outdated script')).toBeInTheDocument()
  })

  it('🔴 an internal drop-reason slug is DROPPED, never printed', () => {
    // The Iris payload schema's enum refuses one at produce time; this is the
    // second gate. `quarantined` names a Cerberus outcome and is the exact
    // disclosure the 28-08-2026 quarantine-stats leak was about.
    arm({ ingest: { rejected_last_7d: true, causes: ['quarantined', 'session_dedup', 'plan_ceiling'] } })
    render(<SiteMonitoringTab siteId="s1" />)
    expect(screen.getByText('plan ceiling')).toBeInTheDocument()
    expect(screen.queryByText(/quarantined/)).not.toBeInTheDocument()
    expect(screen.queryByText(/session_dedup/)).not.toBeInTheDocument()
  })

  it('rejected with every cause unrecognised: the chip alone, not an empty list', () => {
    arm({ ingest: { rejected_last_7d: true, causes: ['something_new'] } })
    render(<SiteMonitoringTab siteId="s1" />)
    expect(screen.getByText('Some events rejected')).toBeInTheDocument()
    expect(screen.queryByText(', ')).not.toBeInTheDocument()
  })

  it('🔴 an unresolved read is an em dash — never "All events counted"', () => {
    arm()
    useIngestHealth.mockReturnValue({ data: undefined, error: undefined })
    render(<SiteMonitoringTab siteId="s1" />)
    expect(screen.queryByText('All events counted')).not.toBeInTheDocument()
    expect(screen.queryByText('Some events rejected')).not.toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('a failed read says so, and does not report health it has not measured', () => {
    arm()
    useIngestHealth.mockReturnValue({ data: undefined, error: new Error('boom') })
    render(<SiteMonitoringTab siteId="s1" />)
    expect(screen.getByText("Couldn't load rejected events.")).toBeInTheDocument()
    expect(screen.queryByText('All events counted')).not.toBeInTheDocument()
  })

  it('the row is in the TRACKING panel, under Install health', () => {
    arm()
    render(<SiteMonitoringTab siteId="s1" />)
    const install = screen.getByText('Install health')
    const rejected = screen.getByText('Rejected events')
    expect(install.compareDocumentPosition(rejected) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('Events Pulse refused in the last 7 days.')).toBeInTheDocument()
  })
})

describe('SiteMonitoringTab — Availability wrap (W1)', () => {
  it('🔴 NO line opens with an orphaned separator — the defect W1 was picked to fix', () => {
    arm({ incidents: 2 })
    const { container } = render(<SiteMonitoringTab siteId="s1" />)
    const lines = (container.textContent || '').split('\n').map((l) => l.trim()).filter(Boolean)
    // Also check every element that renders its own text run: the orphan was a
    // "·" that opened a *span*, which a whole-container textContent would hide.
    const runs = [...container.querySelectorAll('span, p, div')]
      .map((n) => (n.textContent || '').trim())
      .filter(Boolean)
    for (const t of [...lines, ...runs]) expect(t.startsWith('·')).toBe(false)
  })

  it('the month summary is one clause on its own line, beneath the chip and last check', () => {
    arm({ incidents: 0 })
    render(<SiteMonitoringTab siteId="s1" />)
    const month = screen.getByText('99.98% this month, no incidents')
    const lastCheck = screen.getByText(/last check/)
    // Different lines: the month clause is not a sibling inside the chip row.
    expect(month.parentElement).not.toBe(lastCheck.parentElement)
  })

  it.each([
    [99.98, 0, '99.98% this month, no incidents'],
    [99.98, 1, '99.98% this month, 1 incident'],
    [99.98, 3, '99.98% this month, 3 incidents'],
  ])('uptime %s with %s incidents reads "%s"', (pct, n, expected) => {
    arm({ uptimePct: pct as number, incidents: n as number })
    render(<SiteMonitoringTab siteId="s1" />)
    expect(screen.getByText(expected as string)).toBeInTheDocument()
  })

  it('"this month" survives when only one half was measured', () => {
    expect(monthSummary(99.98, null)).toBe('99.98% this month')
    expect(monthSummary(null, 0)).toBe('no incidents this month')
    expect(monthSummary(null, 2)).toBe('2 incidents this month')
    expect(monthSummary(null, null)).toBeNull()
  })

  it('a monitor waiting for its first check shows no month line at all', () => {
    arm({ mon: monitor({ last_status: 'unknown', last_checked_at: null, last_response_time_ms: null }) })
    render(<SiteMonitoringTab siteId="s1" />)
    expect(screen.queryByText(/this month/)).not.toBeInTheDocument()
  })
})

describe('SiteMonitoringTab — the shipped rows match the APPROVED MOCKS', () => {
  // The two strings below are copied verbatim out of the options round's own
  // assertion sidecars, which are what the owner approved on 15-09-2026:
  //   Pulse/docs/data/14-09-2026-monitoring-tab-mocks/row-A-mirror.json  .assert.text
  //   Pulse/docs/data/14-09-2026-monitoring-tab-mocks/wrap-W1-two-lines.json .assert.text
  // A mock that is approved and then built differently is a mock that decided
  // nothing, so the sidecar is pinned here rather than eyeballed later.
  // ⚠️ NOT `textContent`, and not a flat text-node walk either. jsdom has no
  // layout, so textContent concatenates sibling ELEMENTS with no separator
  // ("Uplast check 82 ms"), while joining every text node with a space splits
  // adjacent text nodes INSIDE one element ("82 ms , 1m ago"). What the harness
  // sidecars recorded is innerText: text runs joined inside an element, a
  // boundary between elements. Both wrong flattenings were tried here first,
  // and either one would have tempted a "fix" to the expected string instead.
  const flat = (el: HTMLElement) => {
    const walk = (n: Node): string =>
      n.nodeType === 3 ? (n.textContent || '') : ` ${Array.from(n.childNodes).map(walk).join('')} `
    return walk(el).replace(/\s+/g, ' ').trim()
  }

  it('row A: the Rejected events row reads exactly as row-A-mirror.json', () => {
    arm({ ingest: { rejected_last_7d: true, causes: ['plan_ceiling', 'outdated_script'] } })
    render(<SiteMonitoringTab siteId="s1" />)
    const row = screen.getByText('Rejected events').closest('div.grid') as HTMLElement
    expect(row).toBeTruthy()
    expect(flat(row)).toBe(
      'Rejected events Events Pulse refused in the last 7 days. Some events rejected plan ceiling, outdated script',
    )
  })

  it('row D: the quiet state reads exactly as row-D-clean-state.json', () => {
    arm({ ingest: { rejected_last_7d: false, causes: [] } })
    render(<SiteMonitoringTab siteId="s1" />)
    const row = screen.getByText('Rejected events').closest('div.grid') as HTMLElement
    expect(flat(row)).toBe('Rejected events Events Pulse refused in the last 7 days. All events counted')
  })

  it('wrap W1: the Availability cell reads exactly as wrap-W1-two-lines.json', () => {
    // The sidecar was shot against a live monitor at 82 ms, 1m ago, 100%, no
    // incidents. The fixture reproduces those four values so the comparison is
    // against the approved STRING and not a re-derivation of it.
    arm({
      mon: monitor({ last_response_time_ms: 82, last_checked_at: new Date(Date.now() - 60_000).toISOString() }),
      uptimePct: 100,
      incidents: 0,
    })
    render(<SiteMonitoringTab siteId="s1" />)
    const cell = screen.getByText('Up').closest('div.flex.flex-col') as HTMLElement
    expect(cell).toBeTruthy()
    expect(flat(cell)).toBe('Up last check 82 ms, 1m ago 100% this month, no incidents')
    // And the line structure the direction is actually about: two lines, the
    // second one whole, neither opening with a separator.
    const lines = (cell.innerText ?? cell.textContent ?? '')
    expect(cell.children).toHaveLength(2)
    expect(lines.includes('· ')).toBe(false)
  })
})

describe('SiteMonitoringTab — fetch states', () => {
  it('a failed site read is a visible failure with a retry', () => {
    useSite.mockReturnValue({ data: undefined, error: new Error('boom'), mutate })
    useUptimeStatus.mockReturnValue({ data: undefined, error: undefined, mutate })
    useUptimeIncidents.mockReturnValue({ data: undefined, error: undefined })
    useInstallStatus.mockReturnValue({ data: undefined, error: undefined })
    useIngestHealth.mockReturnValue({ data: undefined, error: undefined })
    render(<SiteMonitoringTab siteId="s1" />)
    expect(screen.getByText("Couldn't load this site")).toBeInTheDocument()
  })
})


describe('SiteMonitoringTab — Traffic (Phase 4, direction T1)', () => {
  it('is its OWN panel asking its own question, with ONE row', () => {
    arm()
    render(<SiteMonitoringTab siteId="s1" />)
    expect(screen.getByText('Traffic')).toBeInTheDocument()
    // The question is the point of direction T1: the owner chose it over the
    // tighter T3 precisely BECAUSE "is traffic behaving normally" is not "is
    // data arriving", and direction B groups by question.
    expect(screen.getByText('Is traffic behaving normally?')).toBeInTheDocument()
    expect(screen.getByText('Traffic level')).toBeInTheDocument()
    // Still read-only. A switch here would control nothing: the rollout is
    // estate-wide and there is no per-site setting.
    expect(screen.queryAllByRole('switch')).toHaveLength(0)
  })

  it('🔴 unwatched reads as an ANSWER with a date, never as a loading state', () => {
    arm({ traffic: { state: 'unwatched', reason: 'session_boundary', watching_from: '2026-09-30', observed: null, expected: null } })
    render(<SiteMonitoringTab siteId="s1" />)
    expect(screen.getByText('Not watched yet')).toBeInTheDocument()
    expect(screen.getByText('Watching from 30 September')).toBeInTheDocument()
    // No fabricated figures. This is the state MOST sites show MOST of the time.
    expect(screen.queryByText(/0 visitors/)).not.toBeInTheDocument()
    expect(screen.queryByText(/expected/)).not.toBeInTheDocument()
  })

  it('unwatched with no knowable end date still names a reason rather than shrugging', () => {
    arm({ traffic: { state: 'unwatched', reason: 'gap', observed: null, expected: null } })
    render(<SiteMonitoringTab siteId="s1" />)
    expect(screen.getByText('Not watched yet')).toBeInTheDocument()
    expect(screen.getByText('No data for the last full day')).toBeInTheDocument()
  })

  it('steady reads as Normal with the day\'s figures', () => {
    arm({ traffic: { state: 'watched', day: '2026-09-15', direction: 'steady', observed: 82, expected: 109 } })
    render(<SiteMonitoringTab siteId="s1" />)
    expect(screen.getByText('Normal')).toBeInTheDocument()
    expect(screen.getByText('82 visitors on 15 September, about 109 visitors expected')).toBeInTheDocument()
  })

  it('a fall is the WARNING tone and names the day it fell on', () => {
    arm({ traffic: { state: 'watched', day: '2026-09-07', direction: 'fell', observed: 8, expected: 139 } })
    render(<SiteMonitoringTab siteId="s1" />)
    const chip = screen.getByText('Traffic fell')
    expect(chip).toBeInTheDocument()
    expect(chip.className).toMatch(/amber/)
    expect(screen.getByText('8 visitors on 7 September, about 139 visitors expected')).toBeInTheDocument()
  })

  it('🔴 a RISE is neutral, not the success tone — a spike is as often a bot wave', () => {
    arm({ traffic: { state: 'watched', day: '2026-09-15', direction: 'rose', observed: 287, expected: 117 } })
    render(<SiteMonitoringTab siteId="s1" />)
    const chip = screen.getByText('Traffic rose')
    expect(chip).toBeInTheDocument()
    expect(chip.className).not.toMatch(/pos|green|success/)
  })

  it('🔴 an unresolved read is an em dash — never "Normal"', () => {
    arm({ traffic: null })
    render(<SiteMonitoringTab siteId="s1" />)
    expect(screen.queryByText('Normal')).not.toBeInTheDocument()
    expect(screen.queryByText('Not watched yet')).not.toBeInTheDocument()
  })

  it('a failed read says so, and does not report a state it has not measured', () => {
    arm({ traffic: null, trafficError: new Error('boom') })
    render(<SiteMonitoringTab siteId="s1" />)
    expect(screen.getByText(/Couldn.t load traffic/)).toBeInTheDocument()
    expect(screen.queryByText('Normal')).not.toBeInTheDocument()
  })

  it('🔴 a judged day with null figures renders the chip alone, never a zero', () => {
    arm({ traffic: { state: 'watched', day: '2026-09-15', direction: 'steady', observed: null, expected: null } })
    render(<SiteMonitoringTab siteId="s1" />)
    expect(screen.getByText('Normal')).toBeInTheDocument()
    expect(screen.queryByText(/0 visitors/)).not.toBeInTheDocument()
  })
})
