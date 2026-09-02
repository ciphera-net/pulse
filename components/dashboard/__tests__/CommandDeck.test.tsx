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
// The tooltip mock CAPTURES its props so the title renderer (the header
// strip's bucket label) can be pinned directly, without a jsdom hover.
const capturedTooltip = vi.hoisted(() => ({} as Record<string, unknown>))
vi.mock('@/components/ui/area-chart', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  const Nothing = () => null
  const CapturingTooltip = (props: Record<string, unknown>) => {
    Object.assign(capturedTooltip, props)
    return null
  }
  return { AreaChart: Box, Area: Nothing, Grid: Nothing, XAxis: Nothing, YAxis: Nothing, ChartTooltip: CapturingTooltip }
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
  multiDayInterval: 'day' as const,
  setMultiDayInterval: noop,
}

describe('CommandDeck rail', () => {
  it('renders the five metrics with their honest context lines', () => {
    render(<CommandDeck {...baseProps} />)
    expect(screen.getByText('Unique visitors')).toBeTruthy()
    // 26-08 identity rebuild: the headline deduplicates people (monthly
    // visitor hash), so the D5 relabel "distinct sessions" is retired.
    expect(screen.getByText('unique people')).toBeTruthy()
    expect(screen.getByText('single-page visits')).toBeTruthy()
    expect(screen.getByText('average')).toBeTruthy()
    // Engagement left the product 01-09-2026 — the rail is five tiles.
    expect(screen.queryByText('Engagement')).toBeNull()
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
})

describe('CommandDeck hourly tooltip span', () => {
  it('spans boundary to boundary — 19:00 – 20:00, never the reference’s :59', () => {
    render(<CommandDeck {...baseProps} interval="hour" />)
    const title = capturedTooltip.title as (p: Record<string, unknown>) => string
    expect(title({ dateObj: new Date('2026-09-02T19:00:00Z') })).toBe('19:00 – 20:00')
    // Midnight rolls over cleanly.
    expect(title({ dateObj: new Date('2026-09-02T23:00:00Z') })).toBe('23:00 – 00:00')
  })
})

describe('CommandDeck interval selector scope', () => {
  it('offers NO minute interval on a single-day range — and no one-option selector', () => {
    const { container } = render(
      <CommandDeck
        {...baseProps}
        interval="hour"
        dateRange={{ start: '2026-08-16', end: '2026-08-16' }}
      />,
    )
    // Minute granularity belongs to the 1h range alone (owner ruling
    // 02-09-2026); a single-day range is fixed hourly, so the selector —
    // which would have exactly one option left — does not render at all.
    // Structural pin: the deck header carries NO listbox trigger (a closed
    // Select hides its option labels, so text queries alone cannot tell a
    // removed selector from a merely closed one).
    expect(container.querySelectorAll('[aria-haspopup="listbox"]').length).toBe(0)
    expect(screen.queryByText('1 min')).toBeNull()
  })

  it('keeps the hour/day selector on multi-day ranges', () => {
    const { container } = render(<CommandDeck {...baseProps} />)
    expect(container.querySelectorAll('[aria-haspopup="listbox"]').length).toBe(1)
    expect(screen.getByText('1 day')).toBeTruthy()
    expect(screen.queryByText('1 min')).toBeNull()
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
    // five tiles, every one measurable in baseProps → 5 traces.
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
