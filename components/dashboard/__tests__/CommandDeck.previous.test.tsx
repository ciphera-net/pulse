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
const captured = vi.hoisted(() => ({ areas: [] as Record<string, unknown>[], tooltip: {} as Record<string, unknown> }))
vi.mock('@/components/ui/area-chart', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  const Nothing = () => null
  const CapturingArea = (props: Record<string, unknown>) => {
    captured.areas.push(props)
    return null
  }
  const CapturingTooltip = (props: Record<string, unknown>) => {
    Object.assign(captured.tooltip, props)
    return null
  }
  return { AreaChart: Box, Area: CapturingArea, Grid: Nothing, XAxis: Nothing, YAxis: Nothing, ChartTooltip: CapturingTooltip, ReferenceLine: Nothing }
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
    expect(prev).toMatchObject({ dataKey: 'prev_visitors', stroke: 'var(--chart-line-secondary)', strokeDasharray: '4 4', fillOpacity: 0, breakAtMissing: true })
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

  it('the in-progress bucket says "(so far)" on a range that ends now', () => {
    render(<CommandDeck {...withPrev} />)
    const title = captured.tooltip.title as Title
    expect(title({ dateObj: new Date(Date.UTC(2026, 8, 17)), isPartial: true })).toBe('Thu, 17/09/2026 (so far)')
    expect(title({ dateObj: new Date(Date.UTC(2026, 8, 16)), isPartial: false })).toBe('Wed, 16/09/2026')
  })
})
