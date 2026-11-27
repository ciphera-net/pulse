import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import CommandDeck, { type DeckLayout } from '@/components/dashboard/CommandDeck'
import type { Stats, DailyStat } from '@/lib/api/stats'

// The deck at a dashboard widget's size (PUL-88, review I1): one `layout` prop in place of the stylesheet that
// widgets/chartVariants.ts laid over the deck's hooks. Agreed with the deck's owners on four conditions, each pinned
// here: without a layout the deck is byte for byte as before (and `readout` too); the height applies from 768 px up
// only; each layout draws what it says; every data-deck-* and data-tour hook stays.
vi.mock('@/components/ui/animated-number', () => ({
  AnimatedNumber: ({ value, format, className }: { value: number; format: (v: number) => string; className?: string }) => (
    <span className={className}>{format(value)}</span>
  ),
}))
vi.mock('@/components/ui/area-chart', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  const Nothing = () => null
  return { AreaChart: Box, Area: Nothing, Grid: Nothing, XAxis: Nothing, YAxis: Nothing, ChartTooltip: Nothing, ReferenceLine: Nothing }
})

const stats: Stats = { pageviews: 456, visitors: 317, visits: 330, bounce_rate: 81, avg_duration: 107, avg_scroll_depth: 61, avg_visible_duration: 31 } as Stats
const prevStats: Stats = { pageviews: 396, visitors: 269, visits: 280, bounce_rate: 78.8, avg_duration: 118, avg_scroll_depth: 58, avg_visible_duration: 29 } as Stats
const day = (date: string, visitors: number): DailyStat => ({
  date, visitors, visits: visitors + 2, pageviews: visitors + 3, bounce_rate: 50, avg_duration: 60, avg_scroll_depth: 55, avg_visible_duration: 20,
})
const props = {
  data: [day('2026-08-16T00:00:00+02:00', 10), day('2026-08-17T00:00:00+02:00', 14)],
  stats,
  prevStats,
  metric: 'visitors' as const,
  onMetricChange: () => {},
  interval: 'day' as const,
  dateRange: { start: '2026-08-16', end: '2026-08-17' },
}
const deck = (layout?: DeckLayout, readout = false) => render(<CommandDeck {...props} readout={readout} layout={layout} />).container

describe('CommandDeck without a layout', () => {
  // The snapshots were written by the deck as it was before the layout prop (main at bab15514).
  it('renders byte for byte as before', async () => {
    await expect(deck().innerHTML).toMatchFileSnapshot('./__snapshots__/CommandDeck-no-layout.html')
  })
  it('renders its readout (Key numbers) byte for byte as before', async () => {
    await expect(deck(undefined, true).innerHTML).toMatchFileSnapshot('./__snapshots__/CommandDeck-readout.html')
  })
})

describe('CommandDeck with a layout', () => {
  const hooks = (c: HTMLElement) => ({
    grid: c.querySelectorAll('[data-deck-grid]').length,
    rail: c.querySelectorAll('[data-tour="metric-rail"]').length,
    rows: [...c.querySelectorAll('[data-deck-row]')].map((n) => n.getAttribute('data-deck-row')),
    chart: c.querySelectorAll('[data-deck-chart]').length,
    toolbar: c.querySelectorAll('[data-tour="chart-toolbar"]').length,
    plot: c.querySelectorAll('[data-deck-plot]').length,
  })
  const all = ['visitors', 'pageviews', 'pages_per_visit', 'bounce_rate', 'avg_duration']

  it('sets its height from 768 px up only, as a variable the grid row reads', () => {
    const grid = deck({ rail: 'side', height: 213 }).querySelector('[data-deck-grid]') as HTMLElement
    expect(grid.style.getPropertyValue('--deck-h')).toBe('213px')
    expect(grid.className.split(' ')).toContain('md:grid-rows-[var(--deck-h)]')
    expect(grid.className).not.toMatch(/(^| )grid-rows-/)
    expect((deck().querySelector('[data-deck-grid]') as HTMLElement).getAttribute('style')).toBeNull()
  })

  it("'side': the rail beside the chart, every hook kept", () => {
    expect(hooks(deck({ rail: 'side', height: 440 }))).toEqual({ grid: 1, rail: 1, rows: all, chart: 1, toolbar: 1, plot: 1 })
  })

  it("'none': the chart alone; the rail is hidden, its title gives way and the plot gives up its floor from 768 px", () => {
    const c = deck({ rail: 'none', height: 213 })
    expect(hooks(c)).toEqual({ grid: 1, rail: 1, rows: all, chart: 1, toolbar: 1, plot: 1 })
    expect((c.querySelector('[data-tour="metric-rail"]') as HTMLElement).className).toBe('hidden')
    expect((c.querySelector('[data-tour="chart-toolbar"]') as HTMLElement).className.split(' ')).toContain('invisible')
    expect((c.querySelector('[data-deck-plot]') as HTMLElement).className.split(' ')).toEqual(expect.arrayContaining(['min-h-[288px]', 'md:min-h-0']))
    expect((c.querySelector('[data-deck-grid]') as HTMLElement).className.split(' ')).toContain('md:grid-cols-[minmax(0,1fr)]')
  })

  it("chart 'none': no chart at all, and the readout unchanged", () => {
    const c = deck({ chart: 'none', rail: 'row', height: 213 }, true)
    expect(hooks(c)).toEqual({ grid: 1, rail: 1, rows: all, chart: 0, toolbar: 0, plot: 0 })
    expect(c.querySelectorAll('button[data-deck-row]').length).toBe(0)
    expect(c.querySelector('[data-deck-active-line]')).toBeNull()
  })

  it("'row': the five across from 768 px, ruled between", () => {
    const c = deck({ chart: 'none', rail: 'row', height: 213 }, true)
    expect((c.querySelector('[data-tour="metric-rail"]') as HTMLElement).className.split(' ')).toContain('md:grid-cols-5')
    const rows = [...c.querySelectorAll('[data-deck-row]')] as HTMLElement[]
    expect(rows[0].className.split(' ')).not.toContain('md:border-l')
    expect(rows.slice(1).every((r) => r.className.split(' ').includes('md:border-l'))).toBe(true)
  })

  it("'stack': the five stacked across the cell, ruled between, with no phone grid", () => {
    const c = deck({ chart: 'none', rail: 'stack', height: 440 }, true)
    const rows = [...c.querySelectorAll('[data-deck-row]')] as HTMLElement[]
    expect(rows.slice(1).every((r) => r.className.split(' ').includes('border-t'))).toBe(true)
    expect(rows.some((r) => r.className.includes('max-md:'))).toBe(false)
  })

  it("'one': exactly the picked row, its label giving way to the widget's picker", () => {
    const c = deck({ chart: 'none', rail: 'one', pick: 'bounce_rate', height: 213 }, true)
    expect(hooks(c).rows).toEqual(['bounce_rate'])
    expect((c.querySelector('[data-deck-row-label]') as HTMLElement).className.split(' ')).toContain('invisible')
    expect(hooks(deck({ chart: 'none', rail: 'one', height: 213 }, true)).rows).toEqual(['visitors'])
  })
})
