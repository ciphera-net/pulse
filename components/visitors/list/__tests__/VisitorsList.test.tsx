import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, fireEvent, screen, waitFor } from '@testing-library/react'
import type { VisitorRow } from '@/lib/api/visitors'

// The new Visitors page's list (look C, R115, R116): the server's page of rows, the first visitor open on arrival, a
// press opening and closing a visitor in place, the site's own events in the Events column, and the dashboard blocks'
// pager (CardPager) over the server's pages of 25.

vi.mock('@/lib/hooks/useDisplayZone', () => ({ useDisplayZone: () => ({ zone: 'UTC' }) }))
vi.mock('../OpenedVisitor', () => ({ default: ({ row }: { row: VisitorRow }) => <div data-opened={row.visitor_key} /> }))

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver
})

import VisitorsList, { FIRST_SORT, PER_PAGE, SERVER_SORT } from '../VisitorsList'

const row = (n: number, over: Partial<VisitorRow> = {}): VisitorRow => ({
  visitor_key: `key-${n}`, month: '2026-11', first_seen: '2026-11-20T10:00:00Z', last_seen: '2026-11-20T11:00:00Z', visits: 2, pageviews: 5, events: 4,
  country: 'BE', region: null, city: 'Ghent', device_type: 'desktop', browser: 'Firefox', os: 'Linux', language: 'nl', screen_resolution: '1920x1080',
  referrer: null, entry_path: '/', active_now: false, own_events: 1, day: [], ...over,
})
const links = { dashboard: () => '/d', journeys: () => '/j', visitor: () => '/v' }
const base = { siteId: 's', range: { startDate: '2026-11-20', endDate: '2026-11-20' }, siteTimezone: 'UTC', links, onFilter: () => {}, onSort: () => {}, phone: 'last_seen' as const, sort: FIRST_SORT, arrival: 'last_seen.desc.1' }

describe('VisitorsList', () => {
  it('opens the first visitor on arrival and opens another in its place on a press', () => {
    render(<VisitorsList {...base} rows={[row(1), row(2)]} total={2} page={1} onPage={() => {}} />)
    expect(document.querySelector('[data-opened]')?.getAttribute('data-opened')).toBe('key-1')
    fireEvent.click(document.querySelector('[data-visitor-line="key-2"] button') as HTMLElement)
    expect(Array.from(document.querySelectorAll('[data-opened]')).map((o) => o.getAttribute('data-opened'))).toEqual(['key-2'])
    // A second press closes it, and nothing opens in its place.
    fireEvent.click(document.querySelector('[data-visitor-line="key-2"] button') as HTMLElement)
    expect(document.querySelector('[data-opened]')).toBeNull()
  })

  it('counts the site\'s own events in the Events column and says "now" for a visitor on the site', () => {
    render(<VisitorsList {...base} rows={[row(1, { own_events: 3, events: 9, active_now: true })]} total={1} page={1} onPage={() => {}} />)
    expect(document.querySelector('[data-visitor-events]')).toHaveTextContent('3')
    expect(document.querySelector('[data-visitor-seen]')?.getAttribute('data-visitor-seen')).toBe('now')
  })

  it('pages with the dashboard blocks\' pager, one page of 25 at a time', () => {
    const onPage = vi.fn()
    render(<VisitorsList {...base} rows={Array.from({ length: PER_PAGE }, (_, i) => row(i))} total={60} page={1} onPage={onPage} />)
    const pager = screen.getByRole('navigation', { name: 'Pages of visitors' })
    expect(pager).toHaveTextContent('3')
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(onPage).toHaveBeenCalledWith(2)
  })

  it('draws no pager for one page', () => {
    render(<VisitorsList {...base} rows={[row(1)]} total={1} page={1} onPage={() => {}} />)
    expect(screen.queryByRole('navigation', { name: 'Pages of visitors' })).toBeNull()
  })

  it('flips once a page: asking for the next page leaves the rows shown in place until the next rows are here', async () => {
    const onPage = vi.fn()
    const first = Array.from({ length: PER_PAGE }, (_, i) => row(i))
    const { rerender } = render(<VisitorsList {...base} rows={first} total={60} page={1} onPage={onPage} />)
    const shown = document.querySelector('[data-visitor-line="key-0"]')
    fireEvent.click(document.querySelector('[data-visitor-line="key-0"] button') as HTMLElement)
    expect(document.querySelector('[data-opened]')).toBeNull()
    // Next is pressed: the pager shows page 2 at once, while the rows on screen are still page 1's (the answer kept
    // while page 2 loads). Nothing flips and the close is kept: they are the same rows, in the same element.
    rerender(<VisitorsList {...base} rows={first} total={60} page={2} onPage={onPage} />)
    expect(document.querySelector('[data-visitor-line="key-0"]')).toBe(shown)
    expect(document.querySelector('[data-opened]')).toBeNull()
    // Page 2's rows arrive: the one flip, and their first visitor opens.
    const second = Array.from({ length: PER_PAGE }, (_, i) => row(PER_PAGE + i))
    rerender(<VisitorsList {...base} rows={second} total={60} page={2} arrival="last_seen.desc.2" onPage={onPage} />)
    // The flip waits for the old page's exit before the new rows mount (AnimatePresence mode="wait").
    await waitFor(() => expect(document.querySelector(`[data-opened="key-${PER_PAGE}"]`)).not.toBeNull())
    expect(document.querySelector('[data-visitor-line="key-0"]')).toBeNull()
  })

  it('asks the server to sort Events by the site\'s own events', () => {
    expect(SERVER_SORT).toEqual({ pageviews: 'pageviews', visits: 'visits', events: 'own_events', last_seen: 'last_seen' })
  })
})
