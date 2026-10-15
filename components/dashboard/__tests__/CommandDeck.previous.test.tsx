import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CommandDeck from '@/components/dashboard/CommandDeck'
import type { Stats, DailyStat } from '@/lib/api/stats'

// PUL-19: the previous period behind the hero chart. The chart primitives need
// layout, so they are stubbed — but the stubs CAPTURE what the deck hands them,
// which is the contract under test: which series are drawn, and what the
// tooltip says.
vi.mock('@/components/ui/animated-number', () => ({
  AnimatedNumber: ({ value, format, className }: { value: number; format: (v: number) => string; className?: string }) => (
    <span className={className}>{format(value)}</span>
  ),
}))
const captured = vi.hoisted(() => ({ areas: [] as Record<string, unknown>[], tooltip: {} as Record<string, unknown>, data: [] as Record<string, unknown>[] }))
vi.mock('@/components/ui/area-chart', () => {
  const CapturingChart = ({ children, data }: { children?: React.ReactNode; data?: Record<string, unknown>[] }) => {
    captured.data.splice(0, captured.data.length, ...(data ?? []))
    return <div>{children}</div>
  }
  const Nothing = () => null
  const CapturingArea = (props: Record<string, unknown>) => {
    captured.areas.push(props)
    return null
  }
  const CapturingTooltip = (props: Record<string, unknown>) => {
    Object.assign(captured.tooltip, props)
    return null
  }
  return { AreaChart: CapturingChart, Area: CapturingArea, Grid: Nothing, XAxis: Nothing, YAxis: Nothing, ChartTooltip: CapturingTooltip, ReferenceLine: Nothing }
})

const stats: Stats = { pageviews: 456, visitors: 317, bounce_rate: 81, avg_duration: 107, avg_scroll_depth: 61, avg_visible_duration: 31 }
const day = (date: string, visitors: number): DailyStat => ({
  date, visitors, visits: visitors, pageviews: visitors + 3,
  bounce_rate: 50, avg_duration: 60, avg_scroll_depth: 55, avg_visible_duration: 20,
})
const noop = () => {}
const current = [day('2026-09-15T00:00:00+02:00', 9), day('2026-09-16T00:00:00+02:00', 3), day('2026-09-17T00:00:00+02:00', 8)]
const previous = [day('2026-08-16T00:00:00+02:00', 6), day('2026-08-17T00:00:00+02:00', 11), day('2026-08-18T00:00:00+02:00', 6)]
const baseProps = {
  data: current,
  stats,
  metric: 'visitors' as const,
  onMetricChange: noop,
  interval: 'day' as const,
  dateRange: { start: '2026-09-15', end: '2026-09-17' },
  period: '7',
  multiDayInterval: 'day' as const,
  setMultiDayInterval: noop,
}
const withPrev = { ...baseProps, prevData: previous, prevRange: { start: '2026-08-16', end: '2026-08-18' } }

type Rows = (p: Record<string, unknown>) => { label: string; value: string }[]
type Title = (p: Record<string, unknown>) => string
const lastAreas = () => captured.areas.slice(-2)

beforeEach(() => {
  captured.areas.length = 0
  for (const k of Object.keys(captured.tooltip)) delete captured.tooltip[k]
})

describe('CommandDeck previous period (PUL-19)', () => {
  it('draws the previous period first, as a dashed grey line with no fill', () => {
    render(<CommandDeck {...withPrev} />)
    const [prev, cur] = lastAreas()
    expect(prev).toMatchObject({ dataKey: 'prev_visitors', stroke: 'var(--chart-line-secondary)', strokeDasharray: '4 4', fillOpacity: 0, missingAsZero: false })
    expect(prev.breakAtMissing).toBeUndefined()
    expect(cur).toMatchObject({ dataKey: 'visitors', stroke: 'var(--chart-1)' })
    expect(cur.strokeDasharray).toBeUndefined()
  })

  it('names both series in a legend — the metric, then "Previous period", with no dates', () => {
    render(<CommandDeck {...withPrev} />)
    const toggle = screen.getByRole('button', { name: 'Previous period' })
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    const legend = toggle.parentElement!
    expect(legend.textContent).toBe('Unique visitorsPrevious period')
  })

  it('the legend entry hides the previous period and brings it back', () => {
    render(<CommandDeck {...withPrev} />)
    const toggle = screen.getByRole('button', { name: 'Previous period' })
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    expect(lastAreas().some((a) => a.dataKey === 'prev_visitors')).toBe(false)
    fireEvent.click(toggle)
    expect(captured.areas.slice(-2)[0].dataKey).toBe('prev_visitors')
  })

  it('draws nothing extra, and no legend, without a previous series', () => {
    render(<CommandDeck {...baseProps} />)
    expect(screen.queryByRole('button', { name: 'Previous period' })).toBeNull()
    expect(captured.areas.every((a) => a.dataKey !== 'prev_visitors')).toBe(true)
  })

  it('the tooltip names the previous day and the change: the difference, plus % past a base of 10', () => {
    render(<CommandDeck {...withPrev} />)
    const rows = captured.tooltip.rows as Rows
    const point = (i: number) => ({
      visitors: current[i].visitors,
      prev_visitors: previous[i].visitors,
      prevDateObj: new Date(Date.UTC(2026, 7, 16 + i)),
    })
    // 3 against 11: the base clears 10, so both.
    expect(rows(point(1)).map((r) => [r.label, r.value])).toEqual([
      ['Unique visitors', '3'],
      ['Mon, 17/08/2026', '11'],
      ['Change', '−8 (−73%)'],
    ])
    // 8 against 6: below the base, the difference alone.
    expect(rows(point(2))[2].value).toBe('+2')
  })

  it('an empty previous bucket reads as an em dash, never 0', () => {
    render(<CommandDeck {...withPrev} />)
    const rows = (captured.tooltip.rows as Rows)({ visitors: 5, prev_visitors: null, prevDateObj: new Date(Date.UTC(2026, 7, 16)) })
    expect(rows[1].value).toBe('—')
    expect(rows[2].value).toBe('—')
  })

  it('an hour the previous day had NO VISITS plots at zero like the current line; only withheld buckets break it', () => {
    // 15-10-2026: the dashed line broke at every hour yesterday was empty
    // (bounce and duration are null there: no visits, no denominator), while
    // the current line plots the same null at zero. Hourly Today, 4 buckets:
    // 00 a real previous hour, 01 a previous hour with no visits, 02 an hour
    // with no partner (a spring-forward day), 03 a real hour again.
    const hour = (date: string, visitors: number, extra: Partial<DailyStat> = {}): DailyStat => ({ ...day(date, visitors), ...extra })
    const empty = { visits: null, bounce_rate: null, avg_duration: null }
    const cur = ['00', '01', '02', '03'].map((h) => hour(`2026-10-15T${h}:00:00+02:00`, 2))
    const prev = [
      hour('2026-10-14T00:00:00+02:00', 4, { bounce_rate: 100, avg_duration: 20 }),
      hour('2026-10-14T01:00:00+02:00', 0, empty),
      hour('2026-10-14T03:00:00+02:00', 1, { bounce_rate: 0, avg_duration: 7 }),
    ]
    const props = { ...baseProps, data: cur, interval: 'hour' as const, period: 'today', dateRange: { start: '2026-10-15', end: '2026-10-15' }, prevData: prev, prevRange: { start: '2026-10-14', end: '2026-10-14' } }
    for (const metric of ['bounce_rate', 'avg_duration', 'pages_per_visit'] as const) {
      captured.areas.length = 0
      render(<CommandDeck {...props} metric={metric} />)
      const [prevArea, curArea] = lastAreas()
      expect(prevArea).toMatchObject({ dataKey: `prev_${metric}`, missingAsZero: true })
      expect(curArea).toMatchObject({ dataKey: metric, missingAsZero: true })
      const defined = prevArea.defined as (d: Record<string, unknown>) => boolean
      // The empty hour has a point (at zero); the unpartnered hour is a gap.
      expect(captured.data.map((d) => defined(d))).toEqual([true, true, false, true])
      expect(captured.data[1][`prev_${metric}`]).toBeNull() // the tooltip still reads '—'
    }
  })

  it('a previous day before the site\'s data, or a duration before engaged time, still breaks the line', () => {
    const cur = [day('2026-09-30T00:00:00+02:00', 5), day('2026-10-01T00:00:00+02:00', 5), day('2026-10-02T00:00:00+02:00', 5)]
    const prev = [day('2026-09-02T00:00:00+02:00', 3), day('2026-09-03T00:00:00+02:00', 3), day('2026-09-04T00:00:00+02:00', 3)]
    const props = { ...baseProps, data: cur, dateRange: { start: '2026-09-30', end: '2026-10-02' }, prevData: prev, prevRange: { start: '2026-09-02', end: '2026-09-04' } }
    // Duration: 02 and 03 are before engaged time (04-09): gaps, not zeros.
    render(<CommandDeck {...props} metric="avg_duration" />)
    let defined = lastAreas()[0].defined as (d: Record<string, unknown>) => boolean
    expect(captured.data.map((d) => defined(d))).toEqual([false, false, true])
    // Bounce on the same days: comparable, so all three have points.
    captured.areas.length = 0
    render(<CommandDeck {...props} metric="bounce_rate" />)
    defined = lastAreas()[0].defined as (d: Record<string, unknown>) => boolean
    expect(captured.data.map((d) => defined(d))).toEqual([true, true, true])
    // A day with visitors but no visit count (frozen before migration 164):
    // pages per visit is unknown there, a gap; bounce on the same day plots.
    const frozen = [day('2026-09-02T00:00:00+02:00', 3), { ...day('2026-09-03T00:00:00+02:00', 3), visits: null }, day('2026-09-04T00:00:00+02:00', 3)]
    captured.areas.length = 0
    render(<CommandDeck {...props} prevData={frozen} metric="pages_per_visit" />)
    defined = lastAreas()[0].defined as (d: Record<string, unknown>) => boolean
    expect(captured.data.map((d) => defined(d))).toEqual([true, false, true])
    captured.areas.length = 0
    render(<CommandDeck {...props} prevData={frozen} metric="bounce_rate" />)
    defined = lastAreas()[0].defined as (d: Record<string, unknown>) => boolean
    expect(captured.data.map((d) => defined(d))).toEqual([true, true, true])
    // A floor on 03-09: the day before it predates the data, for every metric.
    captured.areas.length = 0
    render(<CommandDeck {...props} metric="visitors" prevFloor="2026-09-03" />)
    defined = lastAreas()[0].defined as (d: Record<string, unknown>) => boolean
    expect(captured.data.map((d) => defined(d))).toEqual([false, true, true])
  })

  it('the in-progress bucket says "(so far)" on a range that ends now', () => {
    render(<CommandDeck {...withPrev} />)
    const title = captured.tooltip.title as Title
    expect(title({ dateObj: new Date(Date.UTC(2026, 8, 17)), isPartial: true })).toBe('Thu, 17/09/2026 (so far)')
    expect(title({ dateObj: new Date(Date.UTC(2026, 8, 16)), isPartial: false })).toBe('Wed, 16/09/2026')
  })
})
