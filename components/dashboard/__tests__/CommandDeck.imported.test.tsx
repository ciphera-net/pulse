import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import CommandDeck from '@/components/dashboard/CommandDeck'
import type { DailyStat, ImportedProvenance, Stats } from '@/lib/api/stats'

// Dashboard option 2 on the deck (PULSE-118, M11-h): the boundary line on the
// hero chart and the rail's word, both read from the responses' provenance.
// The visx primitives need layout, so they are inert here, and ReferenceLine
// CAPTURES what it was asked to draw.

vi.mock('@/components/ui/animated-number', () => ({
  AnimatedNumber: ({ value, format, className }: { value: number; format: (v: number) => string; className?: string }) => (
    <span className={className}>{format(value)}</span>
  ),
}))
const drawn = vi.hoisted(() => ({ lines: [] as { x: Date; label?: string }[] }))
vi.mock('@/components/ui/area-chart', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  const Nothing = () => null
  const Line = (props: { x: Date; label?: string }) => {
    drawn.lines.push(props)
    return <div data-testid="reference-line">{props.label}</div>
  }
  return { AreaChart: Box, Area: Nothing, Grid: Nothing, XAxis: Nothing, YAxis: Nothing, ChartTooltip: Nothing, ReferenceLine: Line }
})

const stats: Stats = { pageviews: 347, visitors: 176, bounce_rate: 78, avg_duration: 59, avg_scroll_depth: null, avg_visible_duration: null, visits: 190 }
const day = (date: string, visitors: number): DailyStat => ({
  date, visitors, visits: visitors + 2, pageviews: visitors + 3,
  bounce_rate: 50, avg_duration: 60, avg_scroll_depth: 55, avg_visible_duration: 20,
})
const base = {
  data: [day('2026-08-29T00:00:00+02:00', 10), day('2026-09-15T00:00:00+02:00', 14), day('2026-09-27T00:00:00+02:00', 9)],
  stats,
  metric: 'visitors' as const,
  onMetricChange: () => {},
  interval: 'day' as const,
  dateRange: { start: '2026-08-29', end: '2026-09-27' },
  multiDayInterval: 'day' as const,
  setMultiDayInterval: () => {},
}
const NONE: ImportedProvenance = { included: false, from: null, through: null, source: null, reason: null }
const INCLUDED: ImportedProvenance = { included: true, from: '2026-08-29', through: '2026-09-14', source: 'plausible', reason: null }

beforeEach(() => {
  drawn.lines = []
})

describe('the deck on a range with imported days', () => {
  it('draws the boundary at the first measured day, labelled with what lies to its left', () => {
    render(<CommandDeck {...base} imported={INCLUDED} />)
    expect(drawn.lines).toHaveLength(1)
    expect(drawn.lines[0].x.toISOString()).toBe('2026-09-15T00:00:00.000Z')
    expect(screen.getByTestId('reference-line')).toHaveTextContent('← imported from Plausible')
  })

  it('adds "incl. imported days" to the rows imported days merge into, and not to the two Pulse-only rates', () => {
    render(<CommandDeck {...base} imported={INCLUDED} />)
    expect(screen.getByText('unique people · incl. imported days')).toBeInTheDocument()
    expect(screen.getByText('across the site · incl. imported days')).toBeInTheDocument()
    expect(screen.getByText('depth · incl. imported days')).toBeInTheDocument()
    // Bounce rate and visit duration stay Pulse's own (D2): the word would be false there.
    expect(screen.getByText('single-page visits')).toBeInTheDocument()
    expect(screen.getByText('average')).toBeInTheDocument()
  })

  it('says it when only the COMPARISON period includes imported days', () => {
    render(<CommandDeck {...base} imported={NONE} prevImported={INCLUDED} prevStats={stats} />)
    expect(screen.getByText('unique people · incl. imported days')).toBeInTheDocument()
    // No line: the current range holds no imported day.
    expect(drawn.lines).toHaveLength(0)
  })

  it('draws no line when the range is all imported', () => {
    render(<CommandDeck {...base} imported={{ ...INCLUDED, through: '2026-09-27' }} />)
    expect(drawn.lines).toHaveLength(0)
    expect(screen.getByText('unique people · incl. imported days')).toBeInTheDocument()
  })

  it('draws nothing and adds no word when the response says nothing was merged', () => {
    for (const imported of [undefined, NONE, { ...INCLUDED, included: false, reason: 'filtered' }, { ...INCLUDED, included: false, reason: 'granularity' }]) {
      const { unmount } = render(<CommandDeck {...base} imported={imported} />)
      expect(drawn.lines).toHaveLength(0)
      expect(screen.queryByText(/incl\. imported days/)).toBeNull()
      unmount()
    }
  })

  it('renders the same rail markup as before for a site with no import', () => {
    const { container: a } = render(<CommandDeck {...base} />)
    const before = a.innerHTML
    const { container: b } = render(<CommandDeck {...base} imported={NONE} prevImported={NONE} />)
    // React's useId values count mounts, so they differ between two renders of the same markup.
    const norm = (h: string) => h.replace(/_r_[0-9a-z]+_/g, '_r_ID_')
    expect(norm(b.innerHTML)).toBe(norm(before))
  })
})
