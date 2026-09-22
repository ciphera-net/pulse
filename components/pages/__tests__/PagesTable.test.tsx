import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import PagesTable from '@/components/pages/PagesTable'
import type { PageTableRow } from '@/lib/api/stats'

// ---------------------------------------------------------------------------
// The Pages table's whole risk is the NULLs. Every rate on this surface is
// nullable and every null means "unmeasured", which is a different fact from
// zero — a page nobody entered has no bounce rate, and a page with no preceding
// period has no change. Rendering 0 there invents a measurement, and for the
// change column it specifically claims the page was FLAT.
//
// These are the values production actually produces: /sites/:id/visitors/:id has
// 0 entries and therefore a NULL entry bounce, and /journeys has no scroll
// beacons at all. Both were read off the live database on 22-09-2026.
// ---------------------------------------------------------------------------

const row = (over: Partial<PageTableRow> = {}): PageTableRow => ({
  path: '/a',
  pageviews: 100,
  visitors: 40,
  entries: 10,
  exits: 5,
  exit_rate: 5,
  avg_time_on_page: 30,
  entry_bounce_rate: 20,
  avg_scroll_depth: 80,
  trend: [1, 2, 3],
  delta: 12,
  ...over,
})

function rowFor(path: string) {
  const cell = screen.getByTitle(path)
  // the row is the grid container holding the path cell
  return cell.parentElement as HTMLElement
}

describe('PagesTable nulls', () => {
  it('renders an em dash — never 0 — for every unmeasured rate', () => {
    render(
      <PagesTable
        rows={[
          row({
            path: '/unmeasured',
            entry_bounce_rate: null,
            avg_scroll_depth: null,
            avg_time_on_page: null,
            exit_rate: null,
            delta: null,
          }),
        ]}
      />
    )
    const r = rowFor('/unmeasured')
    // five unmeasured values: change, exit rate, time, bounce, scroll
    expect(within(r).getAllByText('—')).toHaveLength(5)
    expect(within(r).queryByText('0%')).toBeNull()
    expect(within(r).queryByText('0s')).toBeNull()
  })

  it('distinguishes a measured zero from an unmeasured value', () => {
    render(<PagesTable rows={[row({ path: '/real-zero', entry_bounce_rate: 0, delta: null })]} />)
    const r = rowFor('/real-zero')
    // 0% is a real measurement and must still print; the null delta must not
    expect(within(r).getByText('0%')).toBeInTheDocument()
    expect(within(r).getAllByText('—')).toHaveLength(1)
  })
})

describe('PagesTable change indicator', () => {
  it('shows direction with an arrow, not colour alone', () => {
    render(
      <PagesTable
        rows={[row({ path: '/up', delta: 76 }), row({ path: '/down', delta: -25 })]}
      />
    )
    // The sign is in the TEXT, so the column still reads in greyscale and for a
    // colour-blind reader. Colour reinforces direction; it never encodes it.
    expect(within(rowFor('/up')).getByText(/\+76%/)).toBeInTheDocument()
    expect(within(rowFor('/down')).getByText(/-25%/)).toBeInTheDocument()
  })

  it('treats a rounding-to-zero change as flat, not as a direction', () => {
    render(<PagesTable rows={[row({ path: '/flat', delta: 0.2 })]} />)
    const r = rowFor('/flat')
    expect(within(r).getByText('0%')).toBeInTheDocument()
    expect(within(r).queryByText(/\+0%/)).toBeNull()
  })
})

describe('PagesTable sorting', () => {
  const rows = [
    row({ path: '/high', avg_scroll_depth: 90, pageviews: 300 }),
    row({ path: '/low', avg_scroll_depth: 10, pageviews: 200 }),
    row({ path: '/none', avg_scroll_depth: null, pageviews: 100 }),
  ]

  it('sorts by pageviews descending by default', () => {
    render(<PagesTable rows={rows} />)
    const paths = screen.getAllByTitle(/^\//).map((n) => n.textContent)
    expect(paths).toEqual(['/high', '/low', '/none'])
  })

  // 🔴 An unmeasured value must never outrank a measured one. Treating null as 0
  // would put /none above /low on an ascending scroll sort — ranking a page that
  // was never measured above one that measured 10%.
  it('keeps unmeasured rows last in BOTH directions', () => {
    render(<PagesTable rows={rows} />)
    // Re-query between clicks: a captured node can be detached by a re-render,
    // and clicking a detached node silently does nothing.
    const scroll = () => screen.getByRole('button', { name: /scroll/i })

    fireEvent.click(scroll()) // first click: descending
    expect(screen.getAllByTitle(/^\//).map((n) => n.textContent))
      .toEqual(['/high', '/low', '/none'])

    fireEvent.click(scroll()) // second click: ascending
    expect(screen.getAllByTitle(/^\//).map((n) => n.textContent))
      .toEqual(['/low', '/high', '/none'])
  })

  it('sorts by path alphabetically when the Page header is used', () => {
    render(<PagesTable rows={rows} />)
    fireEvent.click(screen.getByRole('button', { name: /^sort by page/i }))
    expect(screen.getAllByTitle(/^\//).map((n) => n.textContent))
      .toEqual(['/high', '/low', '/none'])
  })
})

describe('PagesTable search', () => {
  it('filters rows and reports the filtered count against the total', () => {
    render(
      <PagesTable
        rows={[row({ path: '/pricing' }), row({ path: '/blog/one' }), row({ path: '/blog/two' })]}
        total={3}
      />
    )
    fireEvent.change(screen.getByLabelText('Search pages'), { target: { value: 'blog' } })
    expect(screen.getAllByTitle(/^\//)).toHaveLength(2)
    expect(screen.getByText('2 of 3')).toBeInTheDocument()
    expect(screen.queryByTitle('/pricing')).toBeNull()
  })

  it('says so when a search matches nothing', () => {
    render(<PagesTable rows={[row({ path: '/pricing' })]} />)
    fireEvent.change(screen.getByLabelText('Search pages'), { target: { value: 'zzz' } })
    expect(screen.getByText(/No pages match/)).toBeInTheDocument()
  })
})

describe('PagesTable trend', () => {
  it('draws a sparkline when there is a series and an em dash when there is not', () => {
    const { container } = render(
      <PagesTable rows={[row({ path: '/has', trend: [1, 5, 2] }), row({ path: '/none', trend: [] })]} />
    )
    expect(container.querySelectorAll('polyline')).toHaveLength(1)
    expect(within(rowFor('/none')).getAllByText('—').length).toBeGreaterThan(0)
  })
})
