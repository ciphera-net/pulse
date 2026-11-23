import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import DashboardBottom from '@/components/dashboard/DashboardBottom'
import ConversionBlock, { flowLabel } from '@/components/dashboard/bottom/ConversionBlock'
import WeekHeat, { heatWeek, sayHeatValue } from '@/components/dashboard/bottom/WeekHeat'
import { PerformanceTile, SearchTile, UptimeTile } from '@/components/dashboard/bottom/OverviewTiles'
import { DashboardFrameProvider } from '@/lib/dashboard/frame'
import { SiteScopeProvider, SITE_PAGES, type SiteScope } from '@/lib/scope/SiteScope'

// ---------------------------------------------------------------------------
// THE BOTTOM OF THE NEW DASHBOARD (owner ruling R35 of 15-11-2026): what converts beside the week, then Search,
// Uptime and Performance as three small overviews. components/dashboard/DashboardBottom.tsx.
//
// What these pin, state by state: a block never states a figure it was not given (a dash, a sentence, an error
// with a retry), never asks for a read that can only refuse (Search with no connection, Journeys under a filter
// it cannot apply), every row and tile opens its own page under the reader's own scope, and the week is counted
// on the site's clock in two-hour blocks.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  useFunnels: vi.fn(),
  useFunnelListStats: vi.fn(),
  useJourneyFlow: vi.fn(),
  useDailyStats: vi.fn(),
  useGSCStatus: vi.fn(),
  useGSCOverview: vi.fn(),
  useGSCDailyTotals: vi.fn(),
  useUptimeStatus: vi.fn(),
  usePerformanceLatest: vi.fn(),
  usePerformanceConfig: vi.fn(),
}))

vi.mock('@/lib/swr/dashboard', () => ({
  useFunnels: (...a: unknown[]) => h.useFunnels(...a),
  useFunnelListStats: (...a: unknown[]) => h.useFunnelListStats(...a),
  useJourneyFlow: (...a: unknown[]) => h.useJourneyFlow(...a),
  useDailyStats: (...a: unknown[]) => h.useDailyStats(...a),
  useGSCStatus: (...a: unknown[]) => h.useGSCStatus(...a),
  useGSCOverview: (...a: unknown[]) => h.useGSCOverview(...a),
  useGSCDailyTotals: (...a: unknown[]) => h.useGSCDailyTotals(...a),
  useUptimeStatus: (...a: unknown[]) => h.useUptimeStatus(...a),
  usePerformanceLatest: (...a: unknown[]) => h.usePerformanceLatest(...a),
  usePerformanceConfig: (...a: unknown[]) => h.usePerformanceConfig(...a),
}))
vi.mock('@/lib/skeleton/band', () => ({ registerBar: () => () => undefined }))
// Data behaviour, not motion: the cascade renders plain so no exit animation holds a row in jsdom.
vi.mock('@/components/dashboard/Cascade', () => ({
  CascadeGroup: ({ className, children }: { className?: string; children: React.ReactNode }) => <div className={className}>{children}</div>,
  CascadeRow: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  RowBar: ({ width }: { width: number }) => <div data-testid="row-bar" data-width={width} />,
}))
// The dial and the trace draw themselves; here only what they are handed matters.
// The funnel is drawn with the Funnels page's own chart; here only the steps it is handed matter.
vi.mock('@/components/funnels/FunnelColumns', () => ({
  FunnelColumns: ({ steps }: { steps: { visitors: number }[] }) => <div data-testid="funnel-columns" data-visitors={steps.map((s) => s.visitors).join(',')} />,
}))
// The funnel picker's menu (components/dashboard/TabMenu) enters as the date menu does: the shared stand-in lets a
// closing menu go at once, as the date picker's own tests do.
vi.mock('framer-motion', () => import('@/components/settings/__tests__/framer-mock'))
vi.mock('@/components/performance/ScoreGauge', () => ({
  default: ({ score, size }: { score: number | null; size: number }) => <span data-testid="gauge" data-score={String(score)} data-size={size} />,
}))
vi.mock('@/components/ui/sparkline', () => ({
  Sparkline: ({ values }: { values: number[] }) => <span data-testid="trace" data-values={values.join(',')} />,
}))

const idle = { data: undefined, error: undefined, isLoading: false, mutate: vi.fn() }
const answer = <T,>(data: T) => ({ ...idle, data })
const loading = { ...idle, isLoading: true }
const failing = (mutate = vi.fn()) => ({ ...idle, error: new Error('boom'), mutate })
const dateRange = { start: '2026-10-16', end: '2026-11-14' }
const SITE = 'site-1'
const demo: SiteScope = { siteId: SITE, mode: 'public', basePath: '/demo', pages: SITE_PAGES, demo: true, fidelity: 'full' }
const inFrame = (ui: React.ReactElement, scope?: SiteScope) =>
  render(<DashboardFrameProvider>{scope ? <SiteScopeProvider scope={scope}>{ui}</SiteScopeProvider> : ui}</DashboardFrameProvider>)

beforeEach(() => {
  for (const hook of Object.values(h)) hook.mockReset().mockReturnValue(idle)
})

// ─── What converts ──────────────────────────────────────────────────────────────────────────────────────────────

const funnel = (id: string, name: string) => ({ id, site_id: SITE, name, description: '', steps: [], created_at: '', updated_at: '' })
const stats = (...visitors: number[]) => ({ funnel_id: '', steps: visitors.map((v) => ({ step: {} as never, visitors: v, dropoff: null, conversion: null, exit_pages: [] })) })
/** The visitors of each step of the funnel the chart draws (FunnelColumns is the Funnels page's own; stood in above). */
const chartSteps = () => screen.queryByTestId('funnel-columns')?.getAttribute('data-visitors') ?? null
const picker = () => screen.queryByTestId('funnel-picker')

describe('ConversionBlock: Funnels (R47, R49, R53)', () => {
  // Signup is entered by the most visitors, so it is the funnel the chart opens on.
  const funnels = [funnel('f-a', 'Signup'), funnel('f-b', 'Checkout'), funnel('f-c', 'Newsletter')]
  const listStats = { 'f-a': stats(200, 80, 20), 'f-b': stats(50, 40), 'f-c': stats(0, 0) }
  const loaded = () => {
    h.useFunnels.mockReturnValue(answer(funnels))
    h.useFunnelListStats.mockReturnValue(answer(listStats))
  }

  it('draws one funnel with the Funnels page\'s own chart: the one most visitors enter first', () => {
    loaded()
    inFrame(<ConversionBlock siteId={SITE} dateRange={dateRange} />)
    expect(chartSteps()).toBe('200,80,20')
    expect(picker()?.textContent).toBe('Signup')
    // No rows: the block draws the funnel itself.
    expect(screen.queryAllByTestId('conversion-row')).toHaveLength(0)
  })

  it('picks another with a button made as the date button is, at the tab row\'s size, with its caret', () => {
    loaded()
    inFrame(<ConversionBlock siteId={SITE} dateRange={dateRange} />)
    const button = picker() as HTMLElement
    // Facet's chrome: the date button's hairline on the card's ground.
    for (const cls of ['border-input', 'bg-card', 'h-7', 'text-xs', 'font-normal']) expect(button.className).toContain(cls)
    expect(button.getAttribute('aria-haspopup')).toBe('menu')
    const caret = () => button.querySelectorAll('svg')[1]
    expect(caret().getAttribute('class')).not.toContain('rotate-90')
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(caret().getAttribute('class')).toContain('rotate-90')
  })

  it('lists every funnel, most entered first, the open one ticked; a pick draws that funnel', () => {
    loaded()
    inFrame(<ConversionBlock siteId={SITE} dateRange={dateRange} />)
    fireEvent.click(picker() as HTMLElement)
    const menu = screen.getByRole('menu', { name: 'Funnel' })
    const items = within(menu).getAllByRole('menuitemradio')
    expect(items.map((i) => [i.textContent, i.getAttribute('aria-checked')])).toEqual([['Signup', 'true'], ['Checkout', 'false'], ['Newsletter', 'false']])
    fireEvent.click(items[1])
    expect(chartSteps()).toBe('50,40')
    expect(picker()?.textContent).toBe('Checkout')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('a funnel nobody entered says so, and draws no chart', () => {
    loaded()
    inFrame(<ConversionBlock siteId={SITE} dateRange={dateRange} />)
    fireEvent.click(picker() as HTMLElement)
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitemradio', { name: 'Newsletter' }))
    expect(chartSteps()).toBeNull()
    expect(screen.getByTestId('conversion-empty').textContent).toContain('Nobody entered this funnel')
  })

  it('opens the funnel on its own page, and every funnel from the foot, under the reader\'s own address', () => {
    loaded()
    const member = inFrame(<ConversionBlock siteId={SITE} dateRange={dateRange} />)
    expect(screen.getByRole('link', { name: 'Open Signup' }).getAttribute('href')).toBe('/sites/site-1/funnels/f-a')
    expect(screen.getByRole('link', { name: 'All 3 funnels' }).getAttribute('href')).toBe('/sites/site-1/funnels')
    member.unmount()
    inFrame(<ConversionBlock siteId={SITE} dateRange={dateRange} />, demo)
    expect(screen.getByRole('link', { name: 'Open Signup' }).getAttribute('href')).toBe('/demo/funnels/f-a')
  })

  it('one funnel: its name, and nothing to choose', () => {
    h.useFunnels.mockReturnValue(answer([funnel('f-a', 'Signup')]))
    h.useFunnelListStats.mockReturnValue(answer({ 'f-a': stats(200, 80) }))
    inFrame(<ConversionBlock siteId={SITE} dateRange={dateRange} />)
    expect(picker()).toBeNull()
    expect(screen.getByTestId('funnel-name').textContent).toBe('Signup')
    expect(screen.getByRole('link', { name: 'Open Funnels' }).getAttribute('href')).toBe('/sites/site-1/funnels')
  })

  it('hands the read the page\'s filters and its period, so the chart counts the page\'s visitors', () => {
    inFrame(<ConversionBlock siteId={SITE} dateRange={dateRange} period="24h" filters="v2:country|is|BE" />)
    expect(h.useFunnelListStats).toHaveBeenCalledWith(SITE, dateRange.start, dateRange.end, 'v2:country|is|BE', '24h')
  })

  it('loads at the chart\'s own parts, its four columns, through the skeleton\'s pieces', () => {
    h.useFunnels.mockReturnValue(loading)
    h.useFunnelListStats.mockReturnValue(loading)
    inFrame(<ConversionBlock siteId={SITE} dateRange={dateRange} />)
    expect(screen.getByTestId('conversion-loading').querySelectorAll('.skeleton')).toHaveLength(4)
  })

  it('a site with no funnel says what a funnel is, and offers a member the way to make one', () => {
    h.useFunnels.mockReturnValue(answer([]))
    h.useFunnelListStats.mockReturnValue(answer({}))
    const member = inFrame(<ConversionBlock siteId={SITE} dateRange={dateRange} />)
    const empty = screen.getByTestId('conversion-empty')
    expect(empty.textContent).toContain('No funnels yet')
    expect(empty.textContent).toContain('A funnel shows how many visitors get from one step to the next.')
    expect(within(empty).getByRole('link', { name: 'Create a funnel' }).getAttribute('href')).toBe('/sites/site-1/funnels')
    // Pulse's one empty state (R57, 16-11-2026): the shared EmptyState, its action the bordered button, where this
    // block used to draw a quieter state of its own.
    expect(empty.querySelector('[data-empty-state]')).not.toBeNull()
    expect(within(empty).getByRole('link', { name: 'Create a funnel' }).className.split(' ')).toEqual(expect.arrayContaining(['border-input', 'bg-card']))
    member.unmount()
    // The demo cannot write: it is told what a funnel is and offered nothing it cannot do.
    inFrame(<ConversionBlock siteId={SITE} dateRange={dateRange} />, demo)
    expect(within(screen.getByTestId('conversion-empty')).queryByRole('link')).toBeNull()
  })

  it('a failed read is an error with a retry, never "No funnels yet"', () => {
    const retryFunnels = vi.fn()
    const retryStats = vi.fn()
    h.useFunnels.mockReturnValue(failing(retryFunnels))
    h.useFunnelListStats.mockReturnValue(failing(retryStats))
    inFrame(<ConversionBlock siteId={SITE} dateRange={dateRange} />)
    expect(screen.getByText("Couldn't load funnels")).toBeTruthy()
    expect(screen.queryByTestId('conversion-empty')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retryFunnels).toHaveBeenCalled()
    expect(retryStats).toHaveBeenCalled()
  })

  it('has no Goals tab: a goal is an event with a name, and its row is the Events block\'s (R37)', () => {
    inFrame(<ConversionBlock siteId={SITE} dateRange={dateRange} />)
    expect(screen.getAllByRole('radio').map((t) => t.textContent)).toEqual(['Funnels', 'Journeys'])
  })
})

describe('ConversionBlock: Journeys (R47, R50)', () => {
  // Three steps, as the block asks for them.
  const flow = {
    depth: 3,
    total_sessions: 200,
    columns: [
      { total_sessions: 200, pages: 3, top: [['/', 120], ['/pricing', 50], ['/blog', 30]] },
      { total_sessions: 200, pages: 3, top: [['/pricing', 90], ['/signup', 60], ['/docs', 50]] },
      { total_sessions: 120, pages: 2, top: [['/signup', 70], ['/thanks', 40]] },
    ],
    links: [[0, 0, 0, 70], [0, 1, 1, 40], [0, 0, 2, 50], [1, 0, 0, 30], [1, 1, 1, 25]],
  }
  const open = () => fireEvent.click(screen.getByRole('radio', { name: 'Journeys' }))
  const lit = () => [...document.querySelectorAll('[data-flow-link]')].filter((p) => p.getAttribute('stroke') === '#FD5E0F').length
  // jsdom lays nothing out: the flow is drawn at the size a block gives it.
  let restore: () => void = () => undefined
  beforeEach(() => {
    const cw = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
    const ch = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 600 })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 300 })
    restore = () => {
      if (cw) Object.defineProperty(HTMLElement.prototype, 'clientWidth', cw)
      if (ch) Object.defineProperty(HTMLElement.prototype, 'clientHeight', ch)
    }
  })
  afterEach(() => restore())

  it('is not asked for until its tab is opened, and then for three steps', () => {
    inFrame(<ConversionBlock siteId={SITE} dateRange={dateRange} />)
    expect(h.useJourneyFlow.mock.calls.every((call) => call[0] === '')).toBe(true)
    open()
    expect(h.useJourneyFlow).toHaveBeenLastCalledWith(SITE, dateRange.start, dateRange.end, 3, undefined, undefined, undefined)
  })

  it('draws the Journeys page\'s flow, its pages named and counted, and a press opens Journeys', () => {
    h.useJourneyFlow.mockReturnValue(answer(flow))
    inFrame(<ConversionBlock siteId={SITE} dateRange={dateRange} />)
    open()
    const drawn = screen.getByTestId('conversion-flow')
    expect(drawn.getAttribute('href')).toBe('/sites/site-1/journeys')
    expect(drawn.querySelectorAll('[data-flow-node]').length).toBeGreaterThan(0)
    expect(drawn.querySelectorAll('[data-flow-link]').length).toBeGreaterThan(0)
    expect(drawn.textContent).toContain('Entry · 200')
    expect(screen.getByTestId('metric-unit').textContent).toBe('Sessions')
    // The drawing and the foot are both "Open Journeys", and both go there.
    expect(screen.getAllByRole('link', { name: 'Open Journeys' }).map((l) => l.getAttribute('href'))).toEqual(['/sites/site-1/journeys', '/sites/site-1/journeys'])
  })

  it('a hover on a PATH lights its route and names the hop with its sessions; leaving puts it back (R50)', () => {
    h.useJourneyFlow.mockReturnValue(answer(flow))
    inFrame(<ConversionBlock siteId={SITE} dateRange={dateRange} />)
    open()
    expect(lit()).toBe(0)
    const hit = document.querySelector('[data-flow-hit="0:/|1:/pricing"]') as Element
    expect(hit).not.toBeNull()
    fireEvent.mouseEnter(hit, { clientX: 120, clientY: 80 })
    expect(lit()).toBeGreaterThan(0)
    expect(document.querySelector('[data-flow-link="0:/|1:/pricing"]')?.getAttribute('stroke')).toBe('#FD5E0F')
    expect(screen.getByTestId('conversion-flow-tip').textContent).toBe('/ → /pricing70 sessions')
    fireEvent.mouseLeave(hit)
    expect(lit()).toBe(0)
    expect(screen.queryByTestId('conversion-flow-tip')).toBeNull()
  })

  it('a hover on a page lights the whole route through it, as on the Journeys page, not only its own paths', () => {
    h.useJourneyFlow.mockReturnValue(answer(flow))
    inFrame(<ConversionBlock siteId={SITE} dateRange={dateRange} />)
    open()
    const stroke = (key: string) => document.querySelector(`[data-flow-link="${key}"]`)?.getAttribute('stroke')
    fireEvent.mouseEnter(document.querySelector('[data-flow-node="0:/"]') as Element, { clientX: 20, clientY: 60 })
    // Its own path, and the path two steps on that its visitors walked next.
    expect(stroke('0:/|1:/pricing')).toBe('#FD5E0F')
    expect(stroke('1:/pricing|2:/signup')).toBe('#FD5E0F')
    // A path its visitors never walked stays grey.
    expect(stroke('0:/pricing|1:/signup')).not.toBe('#FD5E0F')
    // The card names the page and ITS sessions (120 of the step's 200).
    expect(screen.getByTestId('conversion-flow-tip').textContent).toBe('/120 sessions')
  })

  it.each([
    ['country', 'v2:country|is|BE'],
    ['device', 'v2:device|is|mobile'],
    ['referrer', 'v2:referrer|is|google.com'],
    ['all three', 'v2:country|is|BE,device|is|mobile,referrer|is_not|t.co'],
  ])('follows a filter on %s, which the journeys read can apply', (_name, filters) => {
    h.useJourneyFlow.mockReturnValue(answer(flow))
    inFrame(<ConversionBlock siteId={SITE} dateRange={dateRange} filters={filters} period="today" />)
    open()
    expect(h.useJourneyFlow).toHaveBeenLastCalledWith(SITE, dateRange.start, dateRange.end, 3, undefined, filters, 'today')
    expect(screen.getByTestId('conversion-flow')).toBeTruthy()
  })

  it.each([
    ['a page', 'v2:page|is|/pricing'],
    ['a browser', 'v2:browser|is|Firefox'],
    ['a campaign', 'v2:utm_source|is|twitter;x'],
    ['one it can apply beside one it cannot', 'v2:country|is|BE,page|contains|blog'],
  ])('under a filter on %s it asks for nothing and says why: a flow that left the filter out would be other visitors', (_name, filters) => {
    h.useJourneyFlow.mockReturnValue(answer(flow))
    inFrame(<ConversionBlock siteId={SITE} dateRange={dateRange} filters={filters} />)
    open()
    // The read is never made for the site: its key stays empty.
    expect(h.useJourneyFlow.mock.calls.every((call) => call[0] === '')).toBe(true)
    expect(screen.queryByTestId('conversion-flow')).toBeNull()
    const empty = screen.getByTestId('conversion-empty')
    expect(empty.textContent).toContain('Journeys cannot follow this filter')
    expect(empty.textContent).toContain('Journeys can be narrowed by country, device and referrer.')
    // The page it names is one press away.
    expect(screen.getByRole('link', { name: 'Open Journeys' })).toBeTruthy()
  })

  it('loads at the flow\'s own parts, its three steps, through the skeleton\'s pieces', () => {
    h.useJourneyFlow.mockReturnValue(loading)
    inFrame(<ConversionBlock siteId={SITE} dateRange={dateRange} />)
    open()
    expect(screen.getByTestId('conversion-loading').querySelectorAll('.skeleton')).toHaveLength(12)
  })

  it('a range with no visit of two pages says so', () => {
    h.useJourneyFlow.mockReturnValue(answer({ ...flow, links: [], total_sessions: 0 }))
    inFrame(<ConversionBlock siteId={SITE} dateRange={dateRange} />)
    open()
    expect(screen.getByTestId('conversion-empty').textContent).toContain('No journeys in this range')
  })

  it('a failed read is an error with a retry', () => {
    const retry = vi.fn()
    h.useJourneyFlow.mockReturnValue(failing(retry))
    inFrame(<ConversionBlock siteId={SITE} dateRange={dateRange} />)
    open()
    expect(screen.getByText("Couldn't load journeys")).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retry).toHaveBeenCalled()
  })

  it('names a page in the small space: a deep path by its last part, the bucket as "Other pages"', () => {
    expect(flowLabel('/')).toBe('/')
    expect(flowLabel('/pricing')).toBe('/pricing')
    expect(flowLabel('/bikes/gravel/')).toBe('…/gravel')
    expect(flowLabel('(other)')).toBe('Other pages')
  })
})

// ─── When people come ───────────────────────────────────────────────────────────────────────────────────────────

/** An hour of the site's wall clock, as the series sends it. 2026-11-09 is a Monday. */
const hour = (day: number, h24: number, over: Partial<{ pageviews: number; visitors: number; avg_duration: number | null; bounce_rate: number | null }> = {}) => ({
  date: `2026-11-${String(9 + day).padStart(2, '0')}T${String(h24).padStart(2, '0')}:00:00`,
  pageviews: 0, visitors: 0, avg_duration: null, bounce_rate: null, ...over,
})

describe('heatWeek: the week out of the hourly series', () => {
  it('counts on the site\'s clock, Monday first, in two-hour blocks', () => {
    const week = heatWeek([hour(0, 0, { pageviews: 3 }), hour(0, 1, { pageviews: 4 }), hour(0, 2, { pageviews: 5 }), hour(6, 23, { pageviews: 9 })], 'pageviews')
    expect(week.grid[0][0]).toBe(7) // Monday 00:00 and 01:00
    expect(week.grid[0][1]).toBe(5) // Monday 02:00
    expect(week.grid[6][11]).toBe(9) // Sunday 22:00 to 24:00
    expect(week.grid.flat().reduce((a, b) => a + b, 0)).toBe(21)
    expect(week.max).toBe(9)
    expect(week.best).toEqual({ day: 6, column: 11 })
  })

  it('adds the same weekday of two weeks into one cell', () => {
    const week = heatWeek([
      { date: '2026-11-09T14:00:00', pageviews: 2, visitors: 1 },
      { date: '2026-11-16T15:00:00', pageviews: 5, visitors: 3 },
    ], 'visitors')
    expect(week.grid[0][7]).toBe(4)
  })

  it('weights a rate by its hours\' visitors, and an hour with no measurement adds neither value nor weight', () => {
    const week = heatWeek([
      hour(2, 10, { visitors: 30, bounce_rate: 50, avg_duration: 100 }),
      hour(2, 11, { visitors: 10, bounce_rate: 10, avg_duration: null }),
      hour(3, 10, { visitors: 500, bounce_rate: null, avg_duration: null }),
    ], 'bounce_rate')
    expect(week.grid[2][5]).toBe((50 * 30 + 10 * 10) / 40)
    // Thursday's hour was not measured: its cell is empty, and it is not the week's first.
    expect(week.grid[3][5]).toBe(0)
    expect(week.best).toEqual({ day: 2, column: 5 })
    expect(heatWeek([hour(2, 10, { visitors: 30, avg_duration: 100 }), hour(2, 11, { visitors: 10, avg_duration: null })], 'avg_duration').grid[2][5]).toBe(100)
  })

  it('names no busiest time where nothing was measured', () => {
    expect(heatWeek([], 'pageviews')).toMatchObject({ max: 0, best: null })
    expect(heatWeek([hour(1, 9, { visitors: 12, bounce_rate: null })], 'bounce_rate').best).toBeNull()
  })

  it('says a cell in words, and "visits" where it adds visitors over hours', () => {
    expect(sayHeatValue(1234, 'pageviews')).toBe('1,234 pageviews')
    expect(sayHeatValue(48, 'visitors')).toBe('48 visits')
    expect(sayHeatValue(125, 'avg_duration')).toBe('2m 5s a visit')
    expect(sayHeatValue(42, 'avg_duration')).toBe('42s a visit')
    expect(sayHeatValue(37.6, 'bounce_rate')).toBe('38% bounce')
  })
})

describe('WeekHeat', () => {
  const series = [hour(0, 14, { pageviews: 320, visitors: 90 }), hour(0, 15, { pageviews: 80, visitors: 30 }), hour(3, 9, { pageviews: 120, visitors: 200, bounce_rate: 40 })]
  const headline = () => screen.getByTestId('week-heat-headline')

  it('reads the hourly series with the page\'s filters', () => {
    inFrame(<WeekHeat siteId={SITE} dateRange={dateRange} filters="v2:device|is|mobile" />)
    expect(h.useDailyStats).toHaveBeenCalledWith(SITE, dateRange.start, dateRange.end, 'hour', 'v2:device|is|mobile')
  })

  it('at rest names the week\'s busiest two hours, and what makes them so', () => {
    h.useDailyStats.mockReturnValue(answer(series))
    inFrame(<WeekHeat siteId={SITE} dateRange={dateRange} />)
    expect(headline().textContent).toBe('Mondays, 14:00Busiest two hours · 400 pageviews')
  })

  it('follows the measure: another measure, another two hours', () => {
    h.useDailyStats.mockReturnValue(answer(series))
    inFrame(<WeekHeat siteId={SITE} dateRange={dateRange} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Visitors' }))
    expect(headline().textContent).toBe('Thursdays, 08:00Most visits in two hours · 200 visits')
    fireEvent.click(screen.getByRole('radio', { name: 'Bounce' }))
    expect(headline().textContent).toBe('Thursdays, 08:00Highest bounce in two hours · 40% bounce')
  })

  it('under the pointer names the two hours pointed at, and goes back when the pointer leaves', () => {
    h.useDailyStats.mockReturnValue(answer(series))
    inFrame(<WeekHeat siteId={SITE} dateRange={dateRange} />)
    const cell = document.querySelector('[data-heat-cell="3-4"]') as HTMLElement
    fireEvent.pointerEnter(cell, { pointerType: 'mouse' })
    expect(headline().textContent).toBe('Thursdays, 08:00Two hours from then · 120 pageviews')
    fireEvent.pointerLeave(document.querySelector('[data-heat-grid]') as HTMLElement)
    expect(headline().textContent).toBe('Mondays, 14:00Busiest two hours · 400 pageviews')
  })

  it('a finger names a cell by pressing it, and a press anywhere else lets it go', () => {
    h.useDailyStats.mockReturnValue(answer(series))
    inFrame(<WeekHeat siteId={SITE} dateRange={dateRange} />)
    const cell = document.querySelector('[data-heat-cell="3-4"]') as HTMLElement
    // A finger entering is not a press.
    fireEvent.pointerEnter(cell, { pointerType: 'touch' })
    expect(headline().textContent).toContain('Mondays, 14:00')
    fireEvent.pointerDown(cell, { pointerType: 'touch' })
    expect(headline().textContent).toContain('Thursdays, 08:00')
    fireEvent.pointerDown(document.body, { pointerType: 'touch' })
    expect(headline().textContent).toContain('Mondays, 14:00')
  })

  it('draws 7 by 12 cells with no gap between them: every cell owns half the gap on each side', () => {
    h.useDailyStats.mockReturnValue(answer(series))
    inFrame(<WeekHeat siteId={SITE} dateRange={dateRange} />)
    const cells = [...document.querySelectorAll<HTMLElement>('[data-heat-cell]')]
    expect(cells).toHaveLength(84)
    expect(cells.every((c) => c.style.padding === '1.5px')).toBe(true)
    const grid = document.querySelector('[data-heat-grid]') as HTMLElement
    expect(grid.className).not.toMatch(/\bgap-/)
    // The square under the pointer grows; only it moves, and it takes no pointer events.
    const square = cells[0].firstElementChild as HTMLElement
    expect(square.className).toContain('pointer-events-none')
    expect(square.style.transform).toBe('scale(1)')
    fireEvent.pointerEnter(cells[0], { pointerType: 'mouse' })
    expect((cells[0].firstElementChild as HTMLElement).style.transform).toBe('scale(1.3)')
  })

  it('a range with no visit states no time: a dash and a sentence', () => {
    h.useDailyStats.mockReturnValue(answer([]))
    inFrame(<WeekHeat siteId={SITE} dateRange={dateRange} />)
    expect(headline().textContent).toBe('—This range has no visits yet.')
  })

  it('a failed read is an error with a retry, never an empty week', () => {
    const retry = vi.fn()
    h.useDailyStats.mockReturnValue(failing(retry))
    inFrame(<WeekHeat siteId={SITE} dateRange={dateRange} />)
    expect(screen.getByText("Couldn't load the week")).toBeTruthy()
    expect(screen.queryByTestId('week-heat-headline')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retry).toHaveBeenCalled()
  })

  it('loads at the loaded body\'s own parts, through the skeleton\'s pieces', () => {
    h.useDailyStats.mockReturnValue(loading)
    inFrame(<WeekHeat siteId={SITE} dateRange={dateRange} />)
    const body = screen.getByTestId('week-heat-loading')
    expect(body.querySelectorAll('.skeleton')).toHaveLength(3)
    expect(body.querySelector('.min-h-\\[3\\.25rem\\]')).toBeTruthy()
    // The switch is there while it loads.
    expect(screen.getByRole('radiogroup', { name: 'When people come, by' })).toBeTruthy()
  })

  it('past a year reads the most recent 366 days, and says so', () => {
    inFrame(<WeekHeat siteId={SITE} dateRange={{ start: '2024-01-01', end: '2026-11-14' }} />)
    expect(h.useDailyStats).toHaveBeenCalledWith(SITE, '2025-11-14', '2026-11-14', 'hour', undefined)
    expect(screen.getByText('Last 12 months')).toBeTruthy()
  })

  it('is a block of the frame\'s one height', () => {
    inFrame(<WeekHeat siteId={SITE} dateRange={dateRange} />)
    const block = document.querySelector('[data-bottom-block="week"]') as HTMLElement
    for (const c of ['glass-block', 'h-[442px]', 'p-6']) expect(block.classList.contains(c), c).toBe(true)
  })
})

// ─── How the site is doing ──────────────────────────────────────────────────────────────────────────────────────

const tile = (page: string) => document.querySelector(`[data-overview-tile="${page}"]`) as HTMLElement
const value = (page: string) => tile(page).querySelector('[data-tile-value]')?.textContent
const context = (page: string) => tile(page).querySelector('[data-tile-context]')?.textContent

describe('SearchTile', () => {
  const overview = { total_clicks: 1280, total_impressions: 45200, avg_ctr: 2.8, avg_position: 14.26, prev_clicks: 1000, prev_impressions: 40000, prev_avg_ctr: 2.5, prev_avg_position: 15 }

  it('states the clicks with their change, impressions and position, over the daily trace', () => {
    h.useGSCStatus.mockReturnValue(answer({ connected: true }))
    h.useGSCOverview.mockReturnValue(answer(overview))
    h.useGSCDailyTotals.mockReturnValue(answer({ daily_totals: [{ date: 'a', clicks: 3 }, { date: 'b', clicks: 9 }, { date: 'c', clicks: 5 }] }))
    inFrame(<SearchTile siteId={SITE} dateRange={dateRange} />)
    expect(value('search')).toBe('1,280')
    expect(context('search')).toBe('45.2K impressions · position 14.3')
    expect(tile('search').textContent).toContain('↑ 28%')
    expect(screen.getByTestId('trace').getAttribute('data-values')).toBe('3,9,5')
    expect(tile('search').getAttribute('href')).toBe('/sites/site-1/search')
  })

  it('with no connection asks for nothing, states no figure, and says so in a sentence', () => {
    h.useGSCStatus.mockReturnValue(answer({ connected: false }))
    inFrame(<SearchTile siteId={SITE} dateRange={dateRange} />)
    // The two reads are keyed on no site: they are never made.
    expect(h.useGSCOverview).toHaveBeenLastCalledWith('', dateRange.start, dateRange.end)
    expect(h.useGSCDailyTotals).toHaveBeenLastCalledWith('', dateRange.start, dateRange.end)
    expect(value('search')).toBe('—')
    expect(context('search')).toBe('Search Console is not connected.')
    // Still a link: the Search page is where it is connected.
    expect(tile('search').getAttribute('href')).toBe('/sites/site-1/search')
  })

  it('while the connection is not known yet, asks for nothing and says nothing', () => {
    inFrame(<SearchTile siteId={SITE} dateRange={dateRange} />)
    expect(h.useGSCOverview).toHaveBeenLastCalledWith('', dateRange.start, dateRange.end)
    expect(value('search')).toBe('—')
    expect(context('search')).not.toContain('not connected')
  })
})

describe('UptimeTile', () => {
  const day = (date: string, over: Partial<{ total_checks: number; successful_checks: number; failed_checks: number; degraded_checks: number; inconclusive_checks: number; avg_response_time_ms: number }> = {}) => ({
    monitor_id: 'm', date, total_checks: 100, successful_checks: 100, failed_checks: 0, degraded_checks: 0, avg_response_time_ms: 200, min_response_time_ms: null, max_response_time_ms: null, p50_response_time_ms: null, p95_response_time_ms: null, ...over,
  })
  const status = (days: ReturnType<typeof day>[], over: Record<string, unknown> = {}) => ({
    monitors: [{ monitor: {} as never, daily_stats: days, overall_uptime: 99.5 }], overall_uptime: 99.5, status: 'operational', total_monitors: 1, utc_days_before: null, ...over,
  })

  it('states the range\'s uptime, its state in a dot and a word, and the average answer time', () => {
    h.useUptimeStatus.mockReturnValue(answer(status([day('d1', { avg_response_time_ms: 100 }), day('d2', { avg_response_time_ms: 300, total_checks: 300 })])))
    inFrame(<UptimeTile siteId={SITE} dateRange={dateRange} period="24h" />)
    expect(h.useUptimeStatus).toHaveBeenCalledWith(SITE, dateRange.start, dateRange.end, '24h')
    expect(value('uptime')).toBe('99.50%')
    expect(tile('uptime').textContent).toContain('Operational')
    // Weighted by each day's checks: (100*100 + 300*300) / 400.
    expect(context('uptime')).toBe('1 monitor · 250 ms on average')
    expect(tile('uptime').getAttribute('href')).toBe('/sites/site-1/uptime')
  })

  it('writes a whole 100% without decimals', () => {
    h.useUptimeStatus.mockReturnValue(answer(status([day('d1')], { overall_uptime: 100 })))
    inFrame(<UptimeTile siteId={SITE} dateRange={dateRange} />)
    expect(value('uptime')).toBe('100%')
  })

  it('draws the Uptime page\'s candles, one a day, by the page\'s own rule', () => {
    h.useUptimeStatus.mockReturnValue(answer(status([
      day('d1'),
      day('d2', { successful_checks: 98, failed_checks: 2 }),
      day('d3', { successful_checks: 96, degraded_checks: 4 }),
      day('d4', { total_checks: 0, successful_checks: 0 }),
      day('d5', { successful_checks: 10, failed_checks: 1, inconclusive_checks: 89 }),
      day('d6', { successful_checks: 30, inconclusive_checks: 70 }),
      day('d7', { successful_checks: 66, inconclusive_checks: 34 }),
    ])))
    inFrame(<UptimeTile siteId={SITE} dateRange={dateRange} />)
    const candles = [...tile('uptime').querySelectorAll('[data-candle]')]
    // An outage outranks everything; a slow answer of before 23-11-2026 colours nothing; a day with no check is
    // neither up nor down; a day the monitor mostly could not see the site is its own neutral state.
    expect(candles.map((c) => c.getAttribute('data-candle'))).toEqual(['up', 'down', 'up', 'none', 'down', 'unseen', 'up'])
    expect(candles.every((c) => c.getAttribute('width') === '0.72')).toBe(true)
  })

  it('says "Couldn\'t check" with a neutral dot when the monitor cannot see the site', () => {
    h.useUptimeStatus.mockReturnValue(answer(status([day('d1', { successful_checks: 0, inconclusive_checks: 100 })], { status: 'inconclusive' })))
    inFrame(<UptimeTile siteId={SITE} dateRange={dateRange} />)
    expect(tile('uptime').textContent).toContain("Couldn't check")
    expect(tile('uptime').querySelector('.bg-neutral-500')).not.toBeNull()
  })

  it('a site with no monitor is not 100%: a dash, a sentence, no state and no candles', () => {
    h.useUptimeStatus.mockReturnValue(answer({ monitors: [], overall_uptime: 100, status: 'operational', total_monitors: 0, utc_days_before: null }))
    inFrame(<UptimeTile siteId={SITE} dateRange={dateRange} />)
    expect(value('uptime')).toBe('—')
    expect(context('uptime')).toBe('This site has no monitor yet.')
    expect(tile('uptime').textContent).not.toContain('Operational')
    expect(tile('uptime').textContent).not.toContain('100')
    expect(tile('uptime').querySelector('[data-candles]')).toBeNull()
  })

  it('while it loads states no figure', () => {
    inFrame(<UptimeTile siteId={SITE} dateRange={dateRange} />)
    expect(value('uptime')).toBe('—')
  })
})

describe('PerformanceTile', () => {
  const check = (strategy: 'mobile' | 'desktop', scores: [number | null, number | null, number | null, number | null]) => ({
    strategy, performance_score: scores[0], accessibility_score: scores[1], best_practices_score: scores[2], seo_score: scores[3], checked_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
  })
  const dials = () => [...tile('performance').querySelectorAll('[data-dial]')].map((d) => [d.getAttribute('data-dial'), d.querySelector('[data-testid="gauge"]')?.getAttribute('data-score')])

  it('draws the Performance page\'s four dials, by its names and in its order, from the phone\'s check', () => {
    h.usePerformanceLatest.mockReturnValue(answer({ checks: [check('desktop', [99, 98, 97, 96]), check('mobile', [61, 100, 96, 92])], attempts: [] }))
    inFrame(<PerformanceTile siteId={SITE} />)
    expect(dials()).toEqual([['Performance', '61'], ['Accessibility', '100'], ['Best Practices', '96'], ['SEO', '92']])
    expect(tile('performance').textContent).toContain('checked 3 h ago')
    // The device is not named (15-11-2026): the tile shows the check the Performance page opens on.
    expect(tile('performance').textContent).not.toContain('on a phone')
    expect(tile('performance').getAttribute('href')).toBe('/sites/site-1/performance')
  })

  it('a site checked on a desktop alone shows that check, and names no device', () => {
    h.usePerformanceLatest.mockReturnValue(answer({ checks: [check('desktop', [99, 98, null, 96])], attempts: [] }))
    inFrame(<PerformanceTile siteId={SITE} />)
    expect(dials()).toEqual([['Performance', '99'], ['Accessibility', '98'], ['Best Practices', 'null'], ['SEO', '96']])
    expect(tile('performance').textContent).toContain('checked 3 h ago')
    expect(tile('performance').textContent).not.toContain('on a desktop')
  })

  it('with no check yet draws no dial and says so', () => {
    h.usePerformanceLatest.mockReturnValue(answer({ checks: [], attempts: [] }))
    h.usePerformanceConfig.mockReturnValue(answer({ site_id: SITE, enabled: true, frequency: 'weekly', next_check_at: null, created_at: '', updated_at: '' }))
    inFrame(<PerformanceTile siteId={SITE} />)
    expect(tile('performance').querySelector('[data-dials]')).toBeNull()
    expect(context('performance')).toBe('No check has run yet.')
  })

  it('with checks switched off says that instead', () => {
    h.usePerformanceLatest.mockReturnValue(answer({ checks: [], attempts: [] }))
    h.usePerformanceConfig.mockReturnValue(answer({ site_id: SITE, enabled: false, frequency: 'weekly', next_check_at: null, created_at: '', updated_at: '' }))
    inFrame(<PerformanceTile siteId={SITE} />)
    expect(context('performance')).toBe('Performance checks are off for this site.')
  })

  it('takes a row of its own under 1,280 px, where a third of the page cannot hold four named dials', () => {
    h.usePerformanceLatest.mockReturnValue(answer({ checks: [check('mobile', [61, 100, 96, 92])], attempts: [] }))
    inFrame(<PerformanceTile siteId={SITE} />)
    expect(tile('performance').className).toContain('sm:col-span-2 xl:col-span-1')
  })
})

describe('the three tiles under a reader\'s own scope', () => {
  it('each opens its page under the demo\'s address', () => {
    h.useGSCStatus.mockReturnValue(answer({ connected: true }))
    inFrame(<><SearchTile siteId={SITE} dateRange={dateRange} /><UptimeTile siteId={SITE} dateRange={dateRange} /><PerformanceTile siteId={SITE} /></>, demo)
    expect(['search', 'uptime', 'performance'].map((p) => tile(p).getAttribute('href'))).toEqual(['/demo/search', '/demo/uptime', '/demo/performance'])
  })

  it('a page the reader is not served has no tile: a link must lead somewhere', () => {
    const narrow: SiteScope = { ...demo, pages: ['dashboard', 'pages', 'uptime'] }
    inFrame(<><SearchTile siteId={SITE} dateRange={dateRange} /><UptimeTile siteId={SITE} dateRange={dateRange} /><PerformanceTile siteId={SITE} /></>, narrow)
    expect(tile('search')).toBeNull()
    expect(tile('performance')).toBeNull()
    expect(tile('uptime')).toBeTruthy()
  })
})

// ─── The arrangement ────────────────────────────────────────────────────────────────────────────────────────────

describe('DashboardBottom', () => {
  it('draws what converts beside the week, then the three tiles, as two rows of the frame\'s column', () => {
    const { container } = inFrame(<DashboardBottom siteId={SITE} dateRange={dateRange} period="today" filters="v2:country|is|BE" />)
    const [pair, tiles] = [...container.children] as HTMLElement[]
    expect(container.children).toHaveLength(2)
    expect(pair.className).toBe('grid gap-3 lg:grid-cols-2 [&>*]:min-w-0')
    expect([...pair.children].map((c) => c.getAttribute('data-bottom-block'))).toEqual(['conversion', 'week'])
    expect(tiles.className).toBe('grid gap-3 sm:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0')
    expect([...tiles.children].map((c) => c.getAttribute('data-overview-tile'))).toEqual(['search', 'uptime', 'performance'])
  })

  it('hands the two blocks the page\'s filters, and the three tiles none: a monitor, a search click and a dial count no visitor', () => {
    inFrame(<DashboardBottom siteId={SITE} dateRange={dateRange} period="today" filters="v2:country|is|BE" />)
    expect(h.useFunnelListStats).toHaveBeenCalledWith(SITE, dateRange.start, dateRange.end, 'v2:country|is|BE', 'today')
    expect(h.useDailyStats).toHaveBeenCalledWith(SITE, dateRange.start, dateRange.end, 'hour', 'v2:country|is|BE')
    expect(h.useUptimeStatus).toHaveBeenCalledWith(SITE, dateRange.start, dateRange.end, 'today')
    expect(h.usePerformanceLatest).toHaveBeenCalledWith(SITE)
    for (const hook of [h.useGSCStatus, h.useGSCOverview, h.useGSCDailyTotals, h.useUptimeStatus, h.usePerformanceLatest, h.usePerformanceConfig]) {
      expect(hook.mock.calls.flat().some((arg) => typeof arg === 'string' && arg.includes('country'))).toBe(false)
    }
  })
})
