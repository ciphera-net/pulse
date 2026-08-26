import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import CommandDeck from '@/components/dashboard/CommandDeck'
import type { Stats, DailyStat } from '@/lib/api/stats'

// The rail is what these tests pin. AnimatedNumber animates through framer
// motion values (jsdom-hostile) — mock it to the formatted text; the visx chart
// needs layout measurement, so stub the chart primitives to inert containers.
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

const stats: Stats = {
  pageviews: 456,
  visitors: 317,
  bounce_rate: 81,
  avg_duration: 107,
  avg_scroll_depth: 61,
  avg_visible_duration: 31,
}
const prevStats: Stats = {
  pageviews: 396,
  visitors: 269,
  bounce_rate: 78.8,
  avg_duration: 118,
  avg_scroll_depth: 58,
  avg_visible_duration: 29,
}
const day = (date: string, visitors: number): DailyStat => ({
  // visits > visitors on purpose: a fixture where they are equal cannot tell
  // "pages per visit" from "pages per person" (the 26-08 visits split).
  date, visitors, visits: visitors + 2, pageviews: visitors + 3,
  bounce_rate: 50, avg_duration: 60, avg_scroll_depth: 55, avg_visible_duration: 20,
})
const noop = () => {}

const baseProps = {
  data: [day('2026-08-16T00:00:00+02:00', 10), day('2026-08-17T00:00:00+02:00', 14)],
  stats,
  prevStats,
  metric: 'visitors' as const,
  onMetricChange: noop,
  interval: 'day' as const,
  dateRange: { start: '2026-08-16', end: '2026-08-17' },
  todayInterval: 'hour' as const,
  setTodayInterval: noop,
  multiDayInterval: 'day' as const,
  setMultiDayInterval: noop,
}

describe('CommandDeck rail', () => {
  it('renders the six metrics with their honest context lines (D4/D5 relabels)', () => {
    render(<CommandDeck {...baseProps} engagementData={{
      summary: { score: 56, scroll_pctl: 38, time_pctl: 67, depth_pctl: 70, bounce_pctl: 50 },
      daily: [], data_days: 90,
    }} />)
    expect(screen.getByText('Unique visitors')).toBeTruthy()
    // 26-08 identity rebuild: the headline deduplicates people (monthly
    // visitor hash), so the D5 relabel "distinct sessions" is retired.
    expect(screen.getByText('unique people')).toBeTruthy()
    expect(screen.getByText('vs prior 90 days')).toBeTruthy() // D4
    expect(screen.getByText('single-page visits')).toBeTruthy()
    expect(screen.getByText('average')).toBeTruthy()
  })

  it('deltas ride the estate grammar: pp for the bounce rate, % for counts', () => {
    render(<CommandDeck {...baseProps} />)
    // bounce 78.8 -> 81 = +2.2pp; the arrow follows the NUMBER, the colour the harm.
    expect(screen.getByText(/2\.2\s*pp/)).toBeTruthy()
    // visitors 269 -> 317 = +18%.
    expect(screen.getByText(/18\s*%/)).toBeTruthy()
  })

  it('renders an em dash, never a fabricated zero, for unmeasured averages (F11)', () => {
    render(<CommandDeck {...baseProps} stats={{ ...stats, avg_duration: null, bounce_rate: null }} />)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText('0s')).toBeNull()
  })

  it('holds the engagement row in its collecting state below 7 history days', () => {
    render(<CommandDeck {...baseProps} engagementData={{
      summary: { score: 56, scroll_pctl: 1, time_pctl: 1, depth_pctl: 1, bounce_pctl: 1 },
      daily: [], data_days: 3,
    }} />)
    expect(screen.getByText(/collecting · needs 7 days of history/)).toBeTruthy()
  })

  it('states a failed engagement fetch as a failure, not a young site (F17)', () => {
    render(<CommandDeck {...baseProps} engagementError />)
    expect(screen.getByText(/couldn.t load/)).toBeTruthy()
    expect(screen.queryByText(/collecting · needs 7 days of history/)).toBeNull()
  })

  it('marks the engagement row unfiltered ONLY while page filters are active', () => {
    const engagementData = {
      summary: { score: 56, scroll_pctl: 38, time_pctl: 67, depth_pctl: 70, bounce_pctl: 50 },
      daily: [], data_days: 90,
    }
    const { rerender } = render(<CommandDeck {...baseProps} engagementData={engagementData} filtersActive />)
    // The D4 baseline has no dimensions — with filters active, engagement is
    // the one number on the deck the filters do not touch, and says so.
    expect(screen.getByText('vs prior 90 days · unfiltered')).toBeTruthy()
    rerender(<CommandDeck {...baseProps} engagementData={engagementData} />)
    expect(screen.getByText('vs prior 90 days')).toBeTruthy()
    expect(screen.queryByText(/· unfiltered/)).toBeNull()
  })
})

describe('CommandDeck delta colours', () => {
  it('a bounce-rate RISE reads red, a visitors rise reads green (invert prop)', () => {
    const { container } = render(<CommandDeck {...baseProps} />)
    const spans = Array.from(container.querySelectorAll('span'))
    const bounceDelta = spans.find((s) => /2\.2\s*pp/.test(s.textContent ?? ''))
    const visitorsDelta = spans.find((s) => /18\s*%/.test(s.textContent ?? ''))
    // The arrow follows the NUMBER; the colour follows the HARM. Bounce went
    // UP (bad) — red; visitors went UP (good) — green. Dropping the invert
    // prop renders a worsening bounce rate as good news.
    expect(bounceDelta?.className).toContain('text-red-400')
    expect(visitorsDelta?.className).toContain('text-green-400')
  })
})

describe('CommandDeck rail sparklines (S4 restore, 19-08-2026)', () => {
  it('every measurable row carries the ghost trace; exactly the active one is lit', () => {
    const { container } = render(<CommandDeck {...baseProps} />)
    const lines = [...container.querySelectorAll('path[vector-effect="non-scaling-stroke"]')]
    // engagement has no series in baseProps (no daily scores) → 5 of 6 rows.
    expect(lines.length).toBe(5)
    const lit = lines.filter(p => {
      const c = p.getAttribute('class') ?? ''
      return c.includes('stroke-brand-orange') && !c.includes('group-hover')
    })
    expect(lit.length).toBe(1)
    const resting = lines.filter(p => (p.getAttribute('class') ?? '').includes('stroke-neutral-600'))
    expect(resting.length).toBe(4)
    for (const p of resting) {
      expect(p.getAttribute('class')).toContain('group-hover:stroke-brand-orange')
    }
  })
})
