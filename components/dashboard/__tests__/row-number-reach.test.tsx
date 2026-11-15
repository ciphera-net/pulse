import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import Sources from '@/components/dashboard/Sources'
import ContentStats from '@/components/dashboard/ContentStats'
import TechSpecs from '@/components/dashboard/TechSpecs'
import { MetricRowStat } from '@/components/dashboard/MetricRowStat'

// ---------------------------------------------------------------------------
// A rounded number on a list row ("11.3K") opens its exact count ("11,272") under a pointer.
//
// In two lists it could not: the Sources block's referrers and the Pages block's pages. Their rows hold a link, so
// a row cannot be one <button>: a full-row overlay button filters, and everything drawn over it gave the pointer
// up so a press reached the overlay. That included the numbers, so a pointer resting on one was resting on the
// overlay and the tooltip never opened (measured on production, 15-11-2026: 3 of 11 rounded numbers on the page;
// a keyboard could reach all of them).
//
// Now the cluster of numbers owns both halves: in a row with an overlay it gives the pointer up, and each number
// takes it back for its own box and hands a press on to the row's action. jsdom lays nothing out and does no
// hit-testing, so what is pinned here is the wiring; that the tooltip opens under a real pointer is measured in a
// browser.
// ---------------------------------------------------------------------------

const useFullDimensionList = vi.fn()
const useCampaignsList = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({
  useFullDimensionList: (...args: unknown[]) => useFullDimensionList(...args),
  useCampaignsList: (...args: unknown[]) => useCampaignsList(...args),
}))
vi.mock('@/components/dashboard/Cascade', () => ({
  CascadeGroup: ({ className, children }: { className?: string; children: React.ReactNode }) => <div className={className}>{children}</div>,
  CascadeRow: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  RowBar: () => <div data-testid="row-bar" />,
}))

const idle = { data: undefined, error: undefined, isLoading: false, mutate: vi.fn() }
const totals = { pageviews: 60000, visitors: 40000 }
const dateRange = { start: '2026-11-08', end: '2026-11-14' }
const classes = (el: Element) => new Set(el.className.split(/\s+/).filter(Boolean))

beforeEach(() => {
  useFullDimensionList.mockReset().mockReturnValue(idle)
  useCampaignsList.mockReset().mockReturnValue(idle)
})

describe('the cluster of numbers in a row with an overlay', () => {
  const row = { visitors: 11272, pageviews: 13779, bounce_rate: null, avg_duration: null }

  it('gives the pointer up, and each number takes it back for its own box', () => {
    const { container } = render(<MetricRowStat row={row} totals={totals} views overlay={{ onPress: () => {} }} />)
    const cluster = container.firstElementChild as HTMLElement
    expect(classes(cluster).has('pointer-events-none')).toBe(true)
    const numbers = [screen.getByText('11.3K'), screen.getByText('13.8K')]
    for (const number of numbers) {
      expect(classes(number).has('pointer-events-auto')).toBe(true)
      // Still the tooltip's own element: the exact count is its name, and a keyboard stops on it.
      expect(number.getAttribute('tabindex')).toBe('0')
    }
    expect(numbers.map((n) => n.getAttribute('aria-label'))).toEqual(['11,272', '13,779'])
    // The share that slides in under the pointer is not a control: it stays out of the pointer's way.
    expect(classes(screen.getByText('28%')).has('pointer-events-auto')).toBe(false)
  })

  it('hands a press on a number on to the row, once', () => {
    const onPress = vi.fn()
    render(<MetricRowStat row={row} totals={totals} views overlay={{ onPress }} />)
    fireEvent.click(screen.getByText('11.3K'))
    expect(onPress).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('13.8K'))
    expect(onPress).toHaveBeenCalledTimes(2)
  })

  it('a number too small to be rounded takes the pointer back too, so a press on it is not lost', () => {
    const onPress = vi.fn()
    render(<MetricRowStat row={{ ...row, visitors: 412 }} totals={totals} overlay={{ onPress }} />)
    const number = screen.getByText('412')
    expect(classes(number).has('pointer-events-auto')).toBe(true)
    fireEvent.click(number)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('in a row that cannot filter the numbers still take the pointer, and a press does nothing', () => {
    const { container } = render(<MetricRowStat row={row} totals={totals} overlay={{}} />)
    expect(classes(container.firstElementChild as HTMLElement).has('pointer-events-none')).toBe(true)
    const number = screen.getByText('11.3K')
    expect(classes(number).has('pointer-events-auto')).toBe(true)
    expect(() => fireEvent.click(number)).not.toThrow()
  })

  it('without an overlay nothing changes: the row is the button, and a press on a number reaches it by itself', () => {
    const { container } = render(<MetricRowStat row={row} totals={totals} views />)
    expect(classes(container.firstElementChild as HTMLElement).has('pointer-events-none')).toBe(false)
    for (const text of ['11.3K', '13.8K']) expect(classes(screen.getByText(text)).has('pointer-events-auto')).toBe(false)
  })
})

describe('the two lists whose rows have an overlay', () => {
  const referrers = [
    { referrer: 'google.com', pageviews: 13100, visitors: 11272 },
    { referrer: 'duckduckgo.com', pageviews: 500, visitors: 412 },
  ]
  const pages = [
    { path: '/', pageviews: 13779, visitors: 10420, bounce_rate: null, avg_duration: null },
    { path: '/pricing', pageviews: 900, visitors: 640, bounce_rate: null, avg_duration: null },
  ]

  it('Sources, referrers: a press on a row\'s number filters by that row, exactly as its overlay button does', () => {
    const onFilter = vi.fn()
    render(<Sources referrers={referrers} siteId="site-1" dateRange={dateRange} totals={totals} onFilter={onFilter} />)
    const number = screen.getByText('11.3K')
    expect(classes(number).has('pointer-events-auto')).toBe(true)
    fireEvent.click(number)
    fireEvent.click(screen.getByRole('button', { name: 'Filter by referrer: Google' }))
    expect(onFilter).toHaveBeenCalledTimes(2)
    expect(onFilter.mock.calls[0][0]).toEqual(onFilter.mock.calls[1][0])
    expect(onFilter.mock.calls[0][0]).toMatchObject({ dimension: 'referrer', operator: 'is' })
  })

  it('Pages: both numbers of a row filter by its page, exactly as its overlay button does', () => {
    const onFilter = vi.fn()
    render(<ContentStats topPages={pages} entryPages={[]} exitPages={[]} domain="example.com" siteId="site-1" dateRange={dateRange} totals={totals} onFilter={onFilter} />)
    for (const text of ['10.4K', '13.8K']) {
      const number = screen.getByText(text)
      expect(classes(number).has('pointer-events-auto'), text).toBe(true)
      fireEvent.click(number)
    }
    fireEvent.click(screen.getByRole('button', { name: 'Filter by page: /' }))
    expect(onFilter).toHaveBeenCalledTimes(3)
    for (const call of onFilter.mock.calls) expect(call[0]).toEqual({ dimension: 'page', operator: 'is', values: ['/'] })
  })

  it('on a page that cannot filter (a share link) the numbers can still be reached, and a press does nothing', () => {
    render(<ContentStats topPages={pages} entryPages={[]} exitPages={[]} domain="example.com" siteId="site-1" dateRange={dateRange} totals={totals} />)
    expect(screen.queryByRole('button', { name: 'Filter by page: /' })).toBeNull()
    const number = screen.getByText('13.8K')
    expect(classes(number).has('pointer-events-auto')).toBe(true)
    expect(() => fireEvent.click(number)).not.toThrow()
  })

  it('the control: a list whose row IS the button leaves its numbers alone', () => {
    const onFilter = vi.fn()
    render(<TechSpecs browsers={[{ browser: 'Firefox', pageviews: 13100, visitors: 12648 }]} os={[]} devices={[]} screenResolutions={[]} siteId="site-1" dateRange={dateRange} totals={totals} onFilter={onFilter} />)
    const number = screen.getByText('12.6K')
    expect(classes(number).has('pointer-events-auto')).toBe(false)
    // Inside the button, a press on the number is a press on the row.
    fireEvent.click(number)
    expect(onFilter).toHaveBeenCalledTimes(1)
  })
})

describe('every list row with an overlay button tells its numbers so', () => {
  const ROOT = path.resolve(__dirname, '../../..')
  const CARDS = ['Sources', 'ContentStats', 'Locations', 'TechSpecs', 'GoalStats', 'Outbound'].map((name) => `components/dashboard/${name}.tsx`)

  it('no card takes the pointer off its numbers by hand any more', () => {
    for (const file of CARDS) {
      const src = fs.readFileSync(path.join(ROOT, file), 'utf8')
      for (const tag of src.match(/<MetricRowStat\b[^>]*>/g) ?? []) expect(tag, file).not.toContain('pointer-events-none')
    }
  })

  it('a card with an overlay button passes `overlay` on each of its rows that has one', () => {
    const withOverlay: Record<string, number> = {}
    for (const file of CARDS) {
      const src = fs.readFileSync(path.join(ROOT, file), 'utf8')
      const overlays = (src.match(/className="absolute inset-0 w-full h-full/g) ?? []).length
      const told = (src.match(/<MetricRowStat\b[^>]*\boverlay=\{\{ onPress: filterRow \}\}/g) ?? []).length
      if (overlays > 0 || told > 0) withOverlay[file] = overlays
      expect(told, file).toBe(overlays)
    }
    // The two lists whose rows hold a link.
    expect(withOverlay).toEqual({ 'components/dashboard/Sources.tsx': 1, 'components/dashboard/ContentStats.tsx': 1 })
  })
})
