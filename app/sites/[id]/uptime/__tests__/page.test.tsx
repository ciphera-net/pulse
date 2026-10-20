import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import type {
  UptimeCheck,
  UptimeIncident,
  UptimeMonitor,
  UptimeResponseTimesResponse,
  UptimeStatusResponse,
} from '@/lib/api/uptime'
import { SITE_PAGES, SiteScopeProvider, memberScope, type SiteScope } from '@/lib/scope/SiteScope'

// Page-level tests for /sites/<id>/uptime, as a member and under the demo's public
// scope (PUL-34). The same surface draws both; what differs is who may write and
// which requests it makes. `useCan` is TRUE for this whole file, so every absence
// asserted for the public scope is the SCOPE's doing, not a viewer who lacks the
// permission: a signed-in member can open the demo, and must not be offered a write.

const mockSite = vi.fn()
const mockWindow = vi.fn()
const mockStatus = vi.fn()
const mockIncidents = vi.fn()
const mockChecks = vi.fn()
const mockResponseTimes = vi.fn()
const mockCan = vi.fn()
const mockUpdateSite = vi.fn()
const mockRange = vi.fn()

// The module exports ONLY the reads this page may make. A hook it imports from
// anywhere else dies on "No X export is defined on the mock", which is what keeps
// a public view from quietly growing a read the public surface does not serve:
// the site record, the data window, the status, the incident ledger, a monitor's
// response times and its recent checks, and nothing else.
vi.mock('@/lib/swr/dashboard', () => ({
  useSite: (...args: unknown[]) => mockSite(...args),
  useDataWindow: (...args: unknown[]) => mockWindow(...args),
  useUptimeStatus: (...args: unknown[]) => mockStatus(...args),
  useUptimeIncidents: (...args: unknown[]) => mockIncidents(...args),
  useUptimeChecks: (...args: unknown[]) => mockChecks(...args),
  useUptimeResponseTimes: (...args: unknown[]) => mockResponseTimes(...args),
}))

// No `useParams` here on purpose: the surface reads its site from the scope, so a
// call to it would die on the mock instead of quietly reading the wrong place.
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/lib/auth/permissions', () => ({ useCan: (...args: unknown[]) => mockCan(...args) }))
vi.mock('@/lib/api/sites', () => ({ updateSite: (...args: unknown[]) => mockUpdateSite(...args) }))
vi.mock('@/lib/hooks/useQueryParamsWriter', () => ({ useQueryParamsWriter: () => () => {} }))
vi.mock('@/lib/hooks/useUrlDateRange', () => ({ useUrlDateRange: (...args: unknown[]) => mockRange(...args) }))
vi.mock('@/components/ui/DateRangePicker', () => ({ default: () => <div data-testid="range-picker" /> }))
vi.mock('@/components/skeletons', () => ({
  UptimeSkeleton: () => <div className="animate-pulse" data-testid="uptime-skeleton" />,
  useMinimumLoading: (v: boolean) => v,
  useSkeletonFade: () => '',
}))
vi.mock('@ciphera-net/facet', () => ({
  toast: { success: () => {}, error: () => {} },
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  // lib/utils re-exports cn from facet, so ErrorCard breaks without it.
  cn: (...parts: unknown[]) => parts.filter(Boolean).join(' '),
  // The glyph only, like the real component: the panel is a portal that exists only while open.
  InfoTip: ({ title }: { title?: string }) => (
    <button type="button" aria-label={title ? `About ${title}` : 'What this counts'} />
  ),
}))

import UptimeRoute from '../page'
import UptimeSurface from '@/components/surfaces/UptimeSurface'

// /sites/<id>/uptime renders under the member scope (app/sites/[id]/SiteLayoutShell.tsx).
const UptimePage = () => (
  <SiteScopeProvider scope={memberScope('site-1')}>
    <UptimeRoute />
  </SiteScopeProvider>
)

const publicScope = (over: Partial<SiteScope> = {}): SiteScope => ({
  siteId: 'site-1',
  mode: 'public',
  basePath: '/demo',
  pages: SITE_PAGES,
  demo: true,
  fidelity: 'full',
  ...over,
})

const renderUnder = (scope: SiteScope) =>
  render(
    <SiteScopeProvider scope={scope}>
      <UptimeSurface />
    </SiteScopeProvider>,
  )

const monitor: UptimeMonitor = {
  id: 'mon-1',
  site_id: 'site-1',
  name: 'Site',
  url: 'https://haldencycles.example',
  check_interval_seconds: 300,
  expected_status_code: 200,
  timeout_seconds: 30,
  enabled: true,
  last_checked_at: '2026-10-20T09:55:00Z',
  last_status: 'up',
  last_response_time_ms: 182,
  tls_expires_at: null,
  tls_issuer: null,
  tls_checked_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-10-20T09:55:00Z',
}

const status = (over: Partial<UptimeStatusResponse> = {}): UptimeStatusResponse => ({
  monitors: [{ monitor, daily_stats: [], overall_uptime: 99.9 }],
  overall_uptime: 99.9,
  status: 'operational',
  total_monitors: 1,
  utc_days_before: null,
  ...over,
})

const incident = (over: Partial<UptimeIncident> = {}): UptimeIncident => ({
  id: 'inc-1',
  monitor_id: 'mon-1',
  started_at: '2026-10-12T08:00:00Z',
  ended_at: '2026-10-12T08:10:00Z',
  status: 'down',
  first_error_message: null,
  first_status_code: 503,
  failed_checks: 2,
  ...over,
})

const check = (over: Partial<UptimeCheck> = {}): UptimeCheck => ({
  id: 'chk-1',
  monitor_id: 'mon-1',
  status: 'up',
  response_time_ms: 182,
  status_code: 200,
  error_message: null,
  checked_at: '2026-10-20T09:55:00Z',
  ...over,
})

const responseTimes = (buckets: UptimeResponseTimesResponse['buckets'] = []): UptimeResponseTimesResponse => ({
  granularity: 'day',
  buckets,
  summary: null,
  start_date: '2026-09-21',
  end_date: '2026-10-20',
})

const swr = <T,>(data: T | undefined, over: Record<string, unknown> = {}) => ({
  data,
  error: undefined,
  isLoading: false,
  isValidating: false,
  mutate: vi.fn(),
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockCan.mockReturnValue(true)
  mockRange.mockReturnValue({
    period: '30d',
    dateRange: { start: '2026-09-21', end: '2026-10-20' },
    periodReady: true,
    picker: {},
  })
  mockSite.mockReturnValue(swr({ id: 'site-1', domain: 'haldencycles.example', name: 'Halden Cycles', timezone: 'Europe/Oslo', uptime_enabled: true }))
  mockWindow.mockReturnValue(null)
  mockStatus.mockReturnValue(swr(status()))
  mockIncidents.mockReturnValue(swr({ incidents: [incident()], start_date: '2026-09-21', end_date: '2026-10-20' }))
  mockChecks.mockReturnValue(swr([check()]))
  mockResponseTimes.mockReturnValue(swr(responseTimes()))
  mockUpdateSite.mockResolvedValue(undefined)
})

describe('Uptime page — a member', () => {
  it('offers to disable monitoring to a member who may manage it, and does it', async () => {
    const { getByRole } = render(<UptimePage />)
    await act(async () => {
      fireEvent.click(getByRole('button', { name: 'Disable monitoring' }))
    })
    expect(mockUpdateSite).toHaveBeenCalledTimes(1)
    expect(mockUpdateSite).toHaveBeenCalledWith('site-1', expect.objectContaining({ uptime_enabled: false }))
  })

  it('offers nothing to write to a member who may not', () => {
    mockCan.mockReturnValue(false)
    const { queryByRole } = render(<UptimePage />)
    expect(queryByRole('button', { name: 'Disable monitoring' })).toBeNull()
  })

  it('asks for the permission by name', () => {
    render(<UptimePage />)
    expect(mockCan).toHaveBeenCalledWith('uptime.manage')
  })

  it('offers to enable monitoring when it is off, and only to a member who may', () => {
    mockSite.mockReturnValue(swr({ id: 'site-1', domain: 'haldencycles.example', timezone: 'Europe/Oslo', uptime_enabled: false }))
    const withPermission = render(<UptimePage />)
    expect(withPermission.getByRole('button', { name: 'Enable uptime monitoring' })).toBeTruthy()
    withPermission.unmount()

    mockCan.mockReturnValue(false)
    const without = render(<UptimePage />)
    expect(without.queryByRole('button', { name: 'Enable uptime monitoring' })).toBeNull()
    expect(without.container.textContent).toContain('An owner or admin can enable it.')
  })

  it('says it is setting the monitor up when monitoring is on but nothing has reported', () => {
    mockStatus.mockReturnValue(swr(status({ monitors: [], total_monitors: 0 })))
    const { container } = render(<UptimePage />)
    expect(container.textContent).toContain('Setting up the monitor')
  })

  it('tells a member their monitoring is unaffected when the status request fails', () => {
    mockStatus.mockReturnValue(swr(undefined, { error: new Error('500') }))
    const { container } = render(<UptimePage />)
    expect(container.textContent).toContain("Couldn't load uptime status")
    expect(container.textContent).toContain('Your monitoring is unaffected')
  })

  it('keeps the enabling hint in the panel\'s empty note', () => {
    const { container } = render(<UptimePage />)
    expect(container.textContent).toContain('No checks in this period yet.')
    expect(container.textContent).toContain('The first check lands within a minute of enabling.')
  })
})

describe('Uptime page — read from the scope', () => {
  it('asks every read for the SCOPE\'s site, as a member and in public', () => {
    // The surface has no useParams to fall back on (the mock above does not export it),
    // so these ids can only have come from the scope.
    for (const scope of [memberScope('site-1'), publicScope()]) {
      vi.clearAllMocks()
      mockCan.mockReturnValue(true)
      mockSite.mockReturnValue(swr({ id: 'site-1', domain: 'haldencycles.example', timezone: 'Europe/Oslo', uptime_enabled: true }))
      mockWindow.mockReturnValue(null)
      mockStatus.mockReturnValue(swr(status()))
      mockIncidents.mockReturnValue(swr({ incidents: [], start_date: '', end_date: '' }))
      mockChecks.mockReturnValue(swr([check()]))
      mockResponseTimes.mockReturnValue(swr(responseTimes()))

      renderUnder(scope)

      expect(mockSite).toHaveBeenCalledWith('site-1')
      expect(mockWindow).toHaveBeenCalledWith('site-1', 'uptime')
      expect(mockStatus).toHaveBeenCalledWith('site-1', '2026-09-21', '2026-10-20', undefined)
      expect(mockIncidents).toHaveBeenCalledWith('site-1', '2026-09-21', '2026-10-20', undefined)
      expect(mockChecks).toHaveBeenCalledWith('site-1', 'mon-1', 20)
      expect(mockResponseTimes).toHaveBeenCalledWith('site-1', 'mon-1', '2026-09-21', '2026-10-20', undefined)
    }
  })
})

describe('Uptime page — a public scope writes nothing', () => {
  it('has no control that writes, even for a viewer who holds the permission', () => {
    // A member with the permission is offered Disable monitoring on this same fixture:
    // that is what makes the absence below mean something.
    const member = renderUnder(memberScope('site-1'))
    expect(member.getByRole('button', { name: 'Disable monitoring' })).toBeTruthy()
    member.unmount()

    const { container, queryByRole, getByTestId } = renderUnder(publicScope())
    expect(queryByRole('button', { name: 'Disable monitoring' })).toBeNull()
    expect(mockUpdateSite).not.toHaveBeenCalled()
    // The page itself is all there: the range control (a read), the status line, the
    // panel's rails, the incident ledger and the recent checks.
    expect(getByTestId('range-picker')).toBeTruthy()
    const text = container.textContent ?? ''
    expect(text).toContain('Operational')
    expect(text).toContain('Availability')
    expect(text).toContain('Incidents')
    expect(text).toContain('Recent checks')
  })

  it('says there is nothing yet when monitoring is off, and offers nothing to set up', () => {
    mockSite.mockReturnValue(swr({ id: 'site-1', domain: 'haldencycles.example', timezone: 'Europe/Oslo', uptime_enabled: false }))
    const { container, queryByRole } = renderUnder(publicScope())
    const text = container.textContent ?? ''
    expect(text).toContain('Uptime')
    expect(text).toContain('No uptime data yet.')
    expect(text).toContain('Uptime monitoring is off for this site.')
    // Nothing to enable, no way to ask for it, and not the member's off state at all.
    expect(queryByRole('button', { name: /enable/i })).toBeNull()
    expect(text).not.toContain('Enable uptime monitoring')
    expect(text).not.toContain('An owner or admin can enable it.')
    expect(text).not.toContain('Uptime monitoring is off.')
    expect(container.querySelectorAll('button')).toHaveLength(0)
  })

  it('says there is nothing yet when no monitor has reported, not that one is being set up', () => {
    mockStatus.mockReturnValue(swr(status({ monitors: [], total_monitors: 0 })))
    const { container } = renderUnder(publicScope())
    const text = container.textContent ?? ''
    expect(text).toContain('No uptime data yet.')
    expect(text).toContain('No monitor has reported for this site.')
    expect(text).not.toContain('Setting up the monitor')
  })

  it('words a failed request for a visitor, not for the member who runs the monitor', () => {
    mockStatus.mockReturnValue(swr(undefined, { error: new Error('500') }))
    const { container } = renderUnder(publicScope())
    expect(container.textContent).toContain("Couldn't load uptime status")
    expect(container.textContent).not.toContain('Your monitoring')

    vi.clearAllMocks()
    mockSite.mockReturnValue(swr(undefined, { error: Object.assign(new Error('500'), { status: 500 }) }))
    mockStatus.mockReturnValue(swr(status()))
    mockIncidents.mockReturnValue(swr(undefined))
    mockChecks.mockReturnValue(swr(undefined))
    mockResponseTimes.mockReturnValue(swr(undefined))
    const siteFailed = renderUnder(publicScope())
    expect(siteFailed.container.textContent).toContain('Couldn’t load uptime')
    expect(siteFailed.container.textContent).not.toContain('Your monitoring')
  })

  it('holds the skeleton until the view is known, instead of saying there is nothing yet', () => {
    // The status request is not made until the range is known: no data yet, and no
    // failure either. A cold deep link sits in this state between the site arriving and
    // its data window arriving, and "No uptime data yet." would be a claim about a
    // request that has not started.
    mockRange.mockReturnValue({ period: '30d', dateRange: { start: '', end: '' }, periodReady: false, picker: {} })
    mockStatus.mockReturnValue(swr(undefined))
    const waiting = renderUnder(publicScope())
    expect(waiting.getByTestId('uptime-skeleton')).toBeTruthy()
    expect(waiting.container.textContent).not.toContain('No uptime data yet')
    waiting.unmount()

    // The same page once the view is known, with a status that really has no monitor.
    mockRange.mockReturnValue({ period: '30d', dateRange: { start: '2026-09-21', end: '2026-10-20' }, periodReady: true, picker: {} })
    mockStatus.mockReturnValue(swr(status({ monitors: [], total_monitors: 0 })))
    const known = renderUnder(publicScope())
    expect(known.queryByTestId('uptime-skeleton')).toBeNull()
    expect(known.container.textContent).toContain('No uptime data yet.')
  })

  it('drops the enabling hint from the panel\'s empty note', () => {
    const { container } = renderUnder(publicScope())
    expect(container.textContent).toContain('No checks in this period yet.')
    expect(container.textContent).not.toContain('of enabling')
  })

  it('links nowhere into the member app', () => {
    const { container } = renderUnder(publicScope())
    const internal = [...container.querySelectorAll('a')].filter((a) => (a.getAttribute('href') ?? '').startsWith('/'))
    expect(internal).toHaveLength(0)
    expect(container.innerHTML).not.toContain('/settings')
  })
})

describe('Uptime page — a scope that cannot show it', () => {
  const cannotShow: [string, SiteScope][] = [
    ['a share link (scoped reads)', publicScope({ demo: false, fidelity: 'scoped', pages: ['dashboard'], basePath: '/share/site-1' })],
    ['a public scope whose site did not share the page', publicScope({ pages: ['dashboard', 'pages'] })],
  ]

  for (const [name, scope] of cannotShow) {
    it(`says so, and reads nothing: ${name}`, () => {
      const { container } = renderUnder(scope)
      const text = container.textContent ?? ''
      // Not a skeleton that never resolves: the page says what it is and that it is not shared.
      expect(text).toContain("This page isn't shared.")
      expect(container.querySelector('.animate-pulse')).toBeNull()
      // No request was even started, so none can fail.
      expect(mockSite).not.toHaveBeenCalled()
      expect(mockWindow).not.toHaveBeenCalled()
      expect(mockStatus).not.toHaveBeenCalled()
      expect(mockIncidents).not.toHaveBeenCalled()
      expect(mockChecks).not.toHaveBeenCalled()
      expect(mockResponseTimes).not.toHaveBeenCalled()
    })
  }

  it('is not the member\'s: a member scope always shows the page', () => {
    const { container } = renderUnder(memberScope('site-1'))
    expect(container.textContent).not.toContain('This page is not shared')
    expect(mockStatus).toHaveBeenCalled()
  })
})
