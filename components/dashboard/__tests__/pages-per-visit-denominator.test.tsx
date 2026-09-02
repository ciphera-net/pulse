import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import CommandDeck from '@/components/dashboard/CommandDeck'
import type { Stats, DailyStat } from '@/lib/api/stats'

// Same jsdom-hostile stubs as CommandDeck.test.tsx: AnimatedNumber animates
// through framer motion values, and the visx chart needs layout measurement.
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

// "Pages / visit" divides by VISITS. Until the 26-08-2026 visits split it divided
// by `visitors`, which since migration 163 counts PEOPLE deduplicated monthly —
// so a metric labelled "per visit" reported pages per PERSON, and a returning
// reader deepened it instead of adding a visit.
//
// The fixture makes all three quantities distinct (12 pageviews, 4 visits,
// 2 people) so every candidate denominator gives a different answer and the test
// cannot pass by coincidence:
//     ÷ visits = 3.0   ← correct
//     ÷ people = 6.0   ← the defect
//
// MUTATION CHECK: restore `stats.pageviews / stats.visitors` in CommandDeck's
// pages_per_visit branch and the first case fails with 6.0; drop the null guard
// and the second case fails.
const noop = () => {}

const baseStats: Stats = {
  pageviews: 12,
  visitors: 2,
  visits: 4,
  bounce_rate: 50,
  avg_duration: 60,
  avg_scroll_depth: 55,
  avg_visible_duration: 20,
}

const day = (date: string): DailyStat => ({
  date,
  visitors: 2,
  visits: 4,
  pageviews: 12,
  bounce_rate: 50,
  avg_duration: 60,
  avg_scroll_depth: 55,
  avg_visible_duration: 20,
})

function propsFor(stats: Stats) {
  return {
    data: [day('2026-08-16T00:00:00+02:00'), day('2026-08-17T00:00:00+02:00')],
    stats,
    metric: 'visitors' as const,
    onMetricChange: noop,
    interval: 'day' as const,
    dateRange: { start: '2026-08-16', end: '2026-08-17' },
    multiDayInterval: 'day' as const,
    setMultiDayInterval: noop,
  }
}

describe('Pages / visit denominator', () => {
  it('divides pageviews by visits, not by people', () => {
    render(<CommandDeck {...propsFor(baseStats)} />)
    expect(screen.getByText('3.0')).toBeTruthy()
    // 12 / 2 people = 6.0 — the number this test exists to keep off the screen.
    expect(screen.queryByText('6.0')).toBeNull()
  })

  it('shows no ratio at all when the backend sent no visit count', () => {
    // daily_stats rows frozen before migration 164 carry no visits value. The
    // rule is the InfoTip law applied to a metric: omit, never substitute — a
    // fallback to `visitors` would print 6.0 under a label that says per visit.
    const older = { ...baseStats, visits: undefined } as unknown as Stats
    render(<CommandDeck {...propsFor(older)} />)
    expect(screen.queryByText('6.0')).toBeNull()
    expect(screen.queryByText('3.0')).toBeNull()
  })
})
