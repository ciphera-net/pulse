import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TopReferrers from '@/components/dashboard/TopReferrers'
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

describe('dimension blocks follow the selected metric', () => {
  it('shows pageviews (the historical default) with its unit label', () => {
    render(<TopReferrers {...base} metric="pageviews" />)
    expect(screen.getByText('134')).toBeTruthy()
    expect(screen.getByTestId('metric-unit').textContent).toBe('views')
  })

  it('switches the displayed number and label to visitors', () => {
    render(<TopReferrers {...base} metric="visitors" />)
    expect(screen.getByText('61')).toBeTruthy()
    expect(screen.queryByText('134')).toBeNull()
    expect(screen.getByTestId('metric-unit').textContent).toBe('visitors')
  })

  it('shows guarded bounce rates: real above base, em dash below it', () => {
    render(<TopReferrers {...base} metric="bounce_rate" />)
    expect(screen.getByText('41%')).toBeTruthy() // 61 sessions — above the base guard
    expect(screen.getByText('—')).toBeTruthy()   // 3 sessions — guarded, never "100%"
    expect(screen.queryByText('100%')).toBeNull()
    expect(screen.getByTestId('metric-unit').textContent).toBe('bounce')
  })

  it('derives pages/visit per row without any new wire field', () => {
    render(<TopReferrers {...base} metric="pages_per_visit" />)
    expect(screen.getByText('2.2')).toBeTruthy() // 134/61
  })
})

describe('CommandDeck is controlled', () => {
  const noop = () => {}
  const stats: Stats = { pageviews: 300, visitors: 120, visits: 122, bounce_rate: 50, avg_duration: 60, avg_scroll_depth: null, avg_visible_duration: null }
  const data: DailyStat[] = [
    { date: '2026-08-21T00:00:00+02:00', pageviews: 10, visitors: 5, visits: 7, bounce_rate: 40, avg_duration: 50, avg_scroll_depth: null, avg_visible_duration: null },
  ]

  it('reports rail clicks through onMetricChange instead of owning state', () => {
    const onMetricChange = vi.fn()
    render(
      <CommandDeck
        data={data}
        stats={stats}
        metric="visitors"
        onMetricChange={onMetricChange}
        interval="day"
        dateRange={{ start: '2026-08-21', end: '2026-08-21' }}
        todayInterval="hour"
        setTodayInterval={noop}
        multiDayInterval="day"
        setMultiDayInterval={noop}
      />
    )
    fireEvent.click(screen.getByText('Total pageviews'))
    expect(onMetricChange).toHaveBeenCalledWith('pageviews')
  })
})
