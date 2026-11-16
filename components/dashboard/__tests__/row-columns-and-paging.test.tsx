import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import GoalStats from '@/components/dashboard/GoalStats'
import { DIMENSION_ROW, MetricRowStat, MetricUnitLabel } from '@/components/dashboard/MetricRowStat'

// ---------------------------------------------------------------------------
// Two faults of 14-11-2026, pinned so neither comes back:
//
//   * the unit labels in a card's header sat 16 and 24 px away from the numbers
//     they name. The rows and the header shared no definition: every card
//     carried its own copy of a row that was `w-full` AND `-mx-2` (a pair that
//     shifts the row 8 px instead of widening it), and the two number columns
//     had a gap their two labels lacked;
//   * the Events list stopped at its seventh event with no way to the rest.
//
// jsdom lays nothing out, so the first is pinned as a contract on the classes
// (one row definition, one column definition); the pixels were measured on the
// rendered page.
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '../../..')
// The Pages block's Outbound tab draws the rows the Outbound card drew (the card left on 16-11-2026).
const CARDS = ['Sources', 'GoalStats', 'Locations', 'TechSpecs', 'ContentStats', 'OutboundLinksTab', 'events/EventsBlock'].map(
  (name) => `components/dashboard/${name}.tsx`,
)
const classesOf = (el: Element) => new Set(el.className.split(/\s+/).filter(Boolean))

describe('a dimension row has one definition', () => {
  it('is 16 px wider than the content it overhangs by 8 px a side', () => {
    const classes = new Set(DIMENSION_ROW.split(' '))
    expect(classes.has('w-[calc(100%+1rem)]')).toBe(true)
    expect(classes.has('-mx-2')).toBe(true)
    expect(classes.has('px-2')).toBe(true)
    // The pair that caused it: an explicit 100% width is not widened by a negative margin.
    expect(classes.has('w-full')).toBe(false)
  })

  it('every interactive row of the blocks is written with it', () => {
    const found: string[] = []
    const strays: string[] = []
    for (const file of CARDS) {
      const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n')
      lines.forEach((line, i) => {
        // The class at the start of a class string; a comment that names `.interactive-row` is not a row.
        if (!/[`"']interactive-row\b/.test(line)) return
        found.push(`${file}:${i + 1}`)
        if (!line.includes('interactive-row ${DIMENSION_ROW}')) strays.push(`${file}:${i + 1}`)
      })
    }
    // A scan that matches nothing proves nothing: the blocks hold at least seven rows.
    expect(found.length).toBeGreaterThanOrEqual(7)
    expect(strays, strays.join(' · ')).toEqual([])
  })
})

describe('labels and numbers share their columns', () => {
  const row = { visitors: 57, pageviews: 104, bounce_rate: null, avg_duration: null }

  it('the two labels sit in the same columns, the same distance apart, as the two numbers', () => {
    const { container } = render(
      <>
        <MetricUnitLabel views />
        <div data-testid="stat-host">
          <MetricRowStat row={row} totals={{ visitors: 90, pageviews: 201 }} views />
        </div>
      </>,
    )
    const label = screen.getByTestId('metric-unit')
    const labelColumns = [...label.children]
    expect(labelColumns.map((el) => el.textContent)).toEqual(['visitors', 'views'])

    const cluster = container.querySelector('[data-testid="stat-host"] > div') as HTMLElement
    const numbers = [...cluster.children].filter((el) => /^\d/.test(el.textContent ?? '') && !/%/.test(el.textContent ?? ''))
    expect(numbers.map((el) => el.textContent)).toEqual(['57', '104'])

    // The column: a width and an alignment, the same on both sides.
    for (const column of ['w-12', 'text-right']) {
      for (const el of [...labelColumns, ...numbers]) expect(classesOf(el).has(column), `${column} on "${el.textContent}"`).toBe(true)
    }
    // The gap between the two columns, the same on both sides, and the label is a flex row so that gap applies.
    expect(classesOf(cluster).has('gap-2')).toBe(true)
    expect(classesOf(label).has('gap-2')).toBe(true)
    expect(classesOf(label).has('inline-flex')).toBe(true)
  })

  it('a single-number card keeps its one plain label', () => {
    render(<MetricUnitLabel />)
    expect(screen.getByTestId('metric-unit').textContent).toBe('visitors')
    expect(screen.getByTestId('metric-unit').children).toHaveLength(0)
  })
})

describe('the Events list pages past its seventh event', () => {
  const dateRange = { start: '2026-11-08', end: '2026-11-14' }
  // Names without digits, so a row's name can be told from the count printed after it.
  const NAMES = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india']
  const events = NAMES.map((event_name, i) => ({ event_name, count: 90 - i * 10 }))
  const names = () => screen.getAllByTestId('goal-row').map((el) => el.textContent?.replace(/\d+$/, '').trim())

  it('shows seven, and the pager reaches the other two', () => {
    render(<GoalStats goalCounts={events} siteId="site-1" dateRange={dateRange} bare />)
    expect(names()).toEqual(NAMES.slice(0, 7))
    const pager = screen.getByRole('navigation', { name: 'Pages of events' })
    expect(pager).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(names()).toEqual(['hotel', 'india'])
  })

  it('draws a bar against the largest count of the whole list, on every page', () => {
    const { container } = render(<GoalStats goalCounts={events} siteId="site-1" dateRange={dateRange} bare />)
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    const bar = container.querySelector('[data-testid="goal-row"] > div') as HTMLElement
    // The eighth event counts 20 of the list's largest 90: 20 / 90 of the 75% cap. Against its own page it would be 75%.
    expect(parseFloat(bar.style.width)).toBeCloseTo((20 / 90) * 75, 3)
  })

  it('has no pager when seven or fewer events exist', () => {
    render(<GoalStats goalCounts={events.slice(0, 7)} siteId="site-1" dateRange={dateRange} bare />)
    expect(screen.getAllByTestId('goal-row')).toHaveLength(7)
    expect(screen.queryByRole('navigation', { name: 'Pages of events' })).toBeNull()
  })

  it('goes back to the first page when the range changes', () => {
    const { rerender } = render(<GoalStats goalCounts={events} siteId="site-1" dateRange={dateRange} bare />)
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(names()).toHaveLength(2)
    rerender(<GoalStats goalCounts={events} siteId="site-1" dateRange={{ start: '2026-11-01', end: '2026-11-14' }} bare />)
    expect(names()).toHaveLength(7)
  })
})
