import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Sources from '@/components/dashboard/Sources'
import CommandDeck from '@/components/dashboard/CommandDeck'
import type { Stats, DailyStat } from '@/lib/api/stats'

vi.mock('@/lib/swr/dashboard', async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>()
  return { ...mod, useFullDimensionList: () => ({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() }) }
})

// Same stubs the CommandDeck rail tests use: the chart needs layout
// measurement jsdom lacks; the rail is what this file pins.
vi.mock('@/components/ui/animated-number', () => ({
  AnimatedNumber: ({ value, format, className }: { value: number; format: (v: number) => string; className?: string }) => (
    <span className={className}>{format(value)}</span>
  ),
}))
vi.mock('@/components/ui/area-chart', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  const Nothing = () => null
  return { AreaChart: Box, Area: Nothing, Grid: Nothing, XAxis: Nothing, YAxis: Nothing, ChartTooltip: Nothing }
})

const referrers = [
  { referrer: 'https://google.com', pageviews: 134, visitors: 61, visits: 63, bounce_rate: 41.2, avg_duration: 95 },
  { referrer: 'https://tiny.example', pageviews: 9, visitors: 3, visits: 5, bounce_rate: 100, avg_duration: 4 },
]
const totals = { pageviews: 300, visitors: 120 }
const base = {
  referrers,
  siteId: 's1',
  dateRange: { start: '2026-08-16', end: '2026-08-22' },
  totals,
}

// DECOUPLED (owner decision 01-09-2026, Vemetric comparison audit §8): the
// dimension blocks hold a FIXED display — visitors, the field the server
// ranks by — and take no metric prop at all. The chart's selection cannot
// reach them; this file pins that it stays unreachable.
describe('dimension blocks are decoupled from the selected metric', () => {
  it('shows visitors with the visitors unit label', () => {
    render(<Sources {...base} />)
    expect(screen.getByText('61')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByTestId('metric-unit').textContent).toBe('visitors')
  })

  it('never shows the pageview count as the row stat', () => {
    render(<Sources {...base} />)
    expect(screen.queryByText('134')).toBeNull()
    expect(screen.queryByText('9')).toBeNull()
  })
})

describe('CommandDeck is controlled', () => {
  const noop = () => {}
  const stats: Stats = { pageviews: 300, visitors: 120, visits: 122, bounce_rate: 50, avg_duration: 60, avg_scroll_depth: null, avg_visible_duration: null }
  const data: DailyStat[] = [
    { date: '2026-08-21T00:00:00+02:00', pageviews: 10, visitors: 5, visits: 7, bounce_rate: 40, avg_duration: 50, avg_scroll_depth: null, avg_visible_duration: null },
  ]

  const deck = (onMetricChange: (m: string) => void) => (
    <CommandDeck
      data={data}
      stats={stats}
      metric="visitors"
      onMetricChange={onMetricChange}
      interval="day"
      dateRange={{ start: '2026-08-21', end: '2026-08-21' }}
      multiDayInterval="day"
      setMultiDayInterval={noop}
    />
  )

  it('reports rail clicks through onMetricChange instead of owning state', () => {
    const onMetricChange = vi.fn()
    render(deck(onMetricChange))
    fireEvent.click(screen.getByText('Total pageviews'))
    expect(onMetricChange).toHaveBeenCalledWith('pageviews')
  })

  it('renders five tiles — Engagement left the rail with the feature', () => {
    render(deck(() => {}))
    expect(screen.queryByText('Engagement')).toBeNull()
    for (const label of ['Unique visitors', 'Total pageviews', 'Pages / visit', 'Bounce rate', 'Visit duration']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
  })
})
