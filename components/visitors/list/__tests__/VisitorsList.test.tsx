import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { act, render, fireEvent, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { VisitorRow } from '@/lib/api/visitors'

// The new Visitors page's list (look C, R115, R116, R119, R120, R121, R122): the server's page of rows, no visitor open
// until a press opens one (in place and beside the list), a press opening and closing a visitor in place, the site's own
// events in the Events column, the dashboard blocks' pager (CardPager) over the server's pages of 25, and from 820 px of
// block the visitor beside the list in a slim panel that waits for a press and folds (jsdom lays nothing out, so every
// width reads 0: the in-place tests run as a phone, the split tests give the block its width).

vi.mock('@/lib/hooks/useDisplayZone', () => ({ useDisplayZone: () => ({ zone: 'UTC' }) }))
vi.mock('../OpenedVisitor', () => ({
  default: ({ row, header, compact }: { row: VisitorRow; header?: ReactNode; compact?: boolean }) => <div data-opened={row.visitor_key} data-compact={compact ? 'yes' : 'no'}>{header}</div>,
}))

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver
})

import VisitorsList, { FIRST_SORT, PER_PAGE, SERVER_SORT, SPLIT_FROM } from '../VisitorsList'

/** A block of the given width: every element measures so (jsdom measures 0). */
const blockOf = (width: number) =>
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
afterEach(() => { vi.restoreAllMocks() })
const panel = () => document.querySelector('[data-split-panel]')?.getAttribute('data-split-panel') ?? null
const opened = () => Array.from(document.querySelectorAll('[data-opened]')).map((o) => o.getAttribute('data-opened'))
/** The panel's line while no press has picked a visitor (R119). */
const empty = () => document.querySelector('[data-split-panel-empty]')
const pressed = () => Array.from(document.querySelectorAll('[data-visitor-line] button')).map((b) => b.getAttribute('aria-pressed'))
const press = (key: string) => fireEvent.click(document.querySelector(`[data-visitor-line="${key}"] button`) as HTMLElement)
/** The panel says no visitor is picked: no visitor read, no row pressed, the line in its place. */
const waiting = () => {
  expect(panel()).toBe('')
  expect(opened()).toEqual([])
  expect(empty()).toHaveTextContent('Press a visitor to see what they did.')
  expect(pressed().every((p) => p === 'false')).toBe(true)
}

const row = (n: number, over: Partial<VisitorRow> = {}): VisitorRow => ({
  visitor_key: `key-${n}`, month: '2026-11', first_seen: '2026-11-20T10:00:00Z', last_seen: '2026-11-20T11:00:00Z', visits: 2, pageviews: 5, events: 4,
  country: 'BE', region: null, city: 'Ghent', device_type: 'desktop', browser: 'Firefox', os: 'Linux', language: 'nl', screen_resolution: '1920x1080',
  referrer: null, entry_path: '/', active_now: false, own_events: 1, day: [], ...over,
})
const links = { dashboard: () => '/d', journeys: () => '/j', visitor: () => '/v' }
const base = { siteId: 's', range: { startDate: '2026-11-20', endDate: '2026-11-20' }, siteTimezone: 'UTC', links, onFilter: () => {}, onSort: () => {}, phone: 'last_seen' as const, sort: FIRST_SORT, arrival: 'last_seen.desc.1' }

describe('VisitorsList', () => {
  it('opens no visitor on arrival, opens one on a press and another in its place', () => {
    render(<VisitorsList {...base} rows={[row(1), row(2)]} total={2} page={1} onPage={() => {}} />)
    // R119: nothing opens by itself.
    expect(document.querySelector('[data-opened]')).toBeNull()
    expect(Array.from(document.querySelectorAll('[data-visitor-line] button')).map((b) => b.getAttribute('aria-expanded'))).toEqual(['false', 'false'])
    fireEvent.click(document.querySelector('[data-visitor-line="key-1"] button') as HTMLElement)
    expect(Array.from(document.querySelectorAll('[data-opened]')).map((o) => o.getAttribute('data-opened'))).toEqual(['key-1'])
    fireEvent.click(document.querySelector('[data-visitor-line="key-2"] button') as HTMLElement)
    expect(Array.from(document.querySelectorAll('[data-opened]')).map((o) => o.getAttribute('data-opened'))).toEqual(['key-2'])
    // A second press closes it, and nothing opens in its place.
    fireEvent.click(document.querySelector('[data-visitor-line="key-2"] button') as HTMLElement)
    expect(document.querySelector('[data-opened]')).toBeNull()
  })

  it('starts a new list (a tab, a range, a filter) with nothing open', () => {
    // The page keys the list by the list its rows belong to (VisitorsListAnswer.listOf), so a tab remounts it.
    const { rerender } = render(<VisitorsList key="all" {...base} rows={[row(1), row(2)]} total={2} page={1} onPage={() => {}} />)
    fireEvent.click(document.querySelector('[data-visitor-line="key-2"] button') as HTMLElement)
    expect(document.querySelector('[data-opened]')?.getAttribute('data-opened')).toBe('key-2')
    rerender(<VisitorsList key="went_on" {...base} rows={[row(2), row(3)]} total={2} page={1} onPage={() => {}} />)
    expect(document.querySelector('[data-visitor-line="key-3"]')).not.toBeNull()
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
    fireEvent.click(document.querySelector('[data-visitor-line="key-1"] button') as HTMLElement)
    expect(document.querySelector('[data-opened]')?.getAttribute('data-opened')).toBe('key-1')
    // Next is pressed: the pager shows page 2 at once, while the rows on screen are still page 1's (the answer kept
    // while page 2 loads). Nothing flips and the open visitor stays open: they are the same rows, in the same element.
    rerender(<VisitorsList {...base} rows={first} total={60} page={2} onPage={onPage} />)
    expect(document.querySelector('[data-visitor-line="key-0"]')).toBe(shown)
    expect(document.querySelector('[data-opened]')?.getAttribute('data-opened')).toBe('key-1')
    // Page 2's rows arrive: the one flip, with nothing open (R119).
    const second = Array.from({ length: PER_PAGE }, (_, i) => row(PER_PAGE + i))
    rerender(<VisitorsList {...base} rows={second} total={60} page={2} arrival="last_seen.desc.2" onPage={onPage} />)
    // The flip waits for the old page's exit before the new rows mount (AnimatePresence mode="wait").
    await waitFor(() => expect(document.querySelector(`[data-visitor-line="key-${PER_PAGE}"]`)).not.toBeNull())
    expect(document.querySelector('[data-visitor-line="key-0"]')).toBeNull()
    expect(document.querySelector('[data-opened]')).toBeNull()
  })

  it('asks the server to sort Events by the site\'s own events', () => {
    expect(SERVER_SORT).toEqual({ pageviews: 'pageviews', visits: 'visits', events: 'own_events', last_seen: 'last_seen' })
  })

  // R120: the visitor beside the list, from 820 px of block; R119 there too: only a press picks one.
  it('puts the visitor beside the list on a wide block: none on arrival, a press picks one, the carets step', () => {
    blockOf(SPLIT_FROM)
    render(<VisitorsList {...base} rows={[row(1), row(2), row(3)]} total={3} page={1} onPage={() => {}} />)
    expect(document.querySelector('[data-visitors-split]')).not.toBeNull()
    // Nothing opens by itself: the panel says to press a visitor, and nothing unfolds under a row.
    waiting()
    press('key-3')
    expect(panel()).toBe('key-3')
    expect(opened()).toEqual(['key-3'])
    expect(empty()).toBeNull()
    expect(pressed()).toEqual(['false', 'false', 'true'])
    // A second press keeps them: the panel holds them until another is picked.
    press('key-3')
    expect(panel()).toBe('key-3')
    expect(screen.getByRole('button', { name: 'The visitor below' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'The visitor above' }))
    expect(panel()).toBe('key-2')
    fireEvent.click(screen.getByRole('button', { name: 'The visitor above' }))
    expect(panel()).toBe('key-1')
    expect(screen.getByRole('button', { name: 'The visitor above' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'The visitor below' }))
    expect(panel()).toBe('key-2')
  })

  it('starts a new page beside the list with nothing picked once its rows are here', async () => {
    blockOf(1200)
    const first = Array.from({ length: PER_PAGE }, (_, i) => row(i))
    const { rerender } = render(<VisitorsList {...base} rows={first} total={60} page={1} onPage={() => {}} />)
    press('key-4')
    expect(panel()).toBe('key-4')
    // Next asked: the rows shown are still page 1's, so the visitor picked stays.
    rerender(<VisitorsList {...base} rows={first} total={60} page={2} onPage={() => {}} />)
    expect(panel()).toBe('key-4')
    // Page 2's rows arrive: nobody is picked, its first visitor no more than any other (R119).
    const second = Array.from({ length: PER_PAGE }, (_, i) => row(PER_PAGE + i))
    rerender(<VisitorsList {...base} rows={second} total={60} page={2} arrival="last_seen.desc.2" onPage={() => {}} />)
    await waitFor(() => expect(document.querySelector(`[data-visitor-line="key-${PER_PAGE}"]`)).not.toBeNull())
    waiting()
  })

  it('starts a new order or a new list beside the list (a tab, a range, a filter) with nothing picked', async () => {
    blockOf(1200)
    const lines = () => Array.from(document.querySelectorAll('[data-visitor-line]')).map((l) => l.getAttribute('data-visitor-line'))
    const { rerender } = render(<VisitorsList key="all" {...base} rows={[row(1), row(2)]} total={2} page={1} onPage={() => {}} />)
    press('key-2')
    expect(panel()).toBe('key-2')
    // A press on a column's name: the same visitors in a new order, a new arrival. The panel waits at once; the rows
    // flip once the old order's exit is done (AnimatePresence mode="wait"), and none of the new ones is pressed.
    rerender(<VisitorsList key="all" {...base} rows={[row(2), row(1)]} total={2} page={1} arrival="pageviews.desc.1" onPage={() => {}} />)
    expect(panel()).toBe('')
    await waitFor(() => expect(lines()).toEqual(['key-2', 'key-1']))
    waiting()
    press('key-1')
    expect(panel()).toBe('key-1')
    // A quick tab (Converted, Went on, Left after one page): the page keys the list by its list, so it mounts again.
    rerender(<VisitorsList key="went_on" {...base} rows={[row(1), row(3)]} total={2} page={1} arrival="pageviews.desc.1" onPage={() => {}} />)
    waiting()
  })

  it('has no panel under 820 px of block: nothing opens by itself, a press unfolds the visitor in place (R119)', () => {
    blockOf(SPLIT_FROM - 1)
    render(<VisitorsList {...base} rows={[row(1), row(2)]} total={2} page={1} onPage={() => {}} />)
    expect(document.querySelector('[data-visitors-split]')).toBeNull()
    expect(document.querySelector('[data-split-panel]')).toBeNull()
    expect(opened()).toEqual([])
    fireEvent.click(document.querySelector('[data-visitor-line="key-2"] button') as HTMLElement)
    expect(opened()).toEqual(['key-2'])
    expect(document.querySelector('[data-visitor-line="key-2"] button')?.getAttribute('aria-expanded')).toBe('true')
  })

  // R121: the slim panel beside the list, and its fold.
  const root = () => document.querySelector('[data-visitors-list]') as HTMLElement
  const fold = () => root().getAttribute('data-split-fold')
  /** A column's name in the list's head row (the first leaf that says it: the head comes before the rows). */
  const headOf = (word: string) => Array.from(root().querySelectorAll('span')).find((e) => e.children.length === 0 && e.textContent === word) as HTMLElement

  it('keeps Place, Device and Source beside the 380 px panel, leaves Events and Visits to it, keeps names whole', () => {
    blockOf(1200)
    render(<VisitorsList {...base} rows={[row(1), row(2)]} total={2} page={1} onPage={() => {}} />)
    // The panel's room is kept while it waits for a press, so the list does not move when one picks a visitor.
    expect(root().className).toContain('grid-cols-[minmax(0,1fr)_380px]')
    press('key-1')
    expect(root().className).toContain('grid-cols-[minmax(0,1fr)_380px]')
    // R122: the name never gets less than the widest pseudonym needs; the panel narrows their day instead.
    expect(headOf('Visitor').className).toContain('min-w-[212px]')
    expect(document.querySelector('[data-visitor-line="key-1"] > span')?.className).toContain('min-w-[212px]')
    expect(headOf('Place').className).toContain('cq-[700px]:block')
    expect(headOf('Device').className).toContain('cq-[700px]:block')
    expect(headOf('Source').className).toContain('cq-[760px]:block')
    // Events steps out of the list (the panel counts it), on every width the list has beside the panel.
    expect(document.querySelector('[data-visitor-events]')?.className).toMatch(/(^|\s)hidden(\s|$)/)
    expect(document.querySelector('[data-visitor-events]')?.className).not.toContain('cq-[960px]:inline-flex')
    // R122: Visits steps out too; the panel counts it.
    expect(document.querySelector('[data-visitor-visits]')?.className).toMatch(/(^|\s)hidden(\s|$)/)
    expect(document.querySelector('[data-visitor-visits]')?.className).not.toContain('inline-flex')
    expect(document.querySelector('[data-opened]')?.getAttribute('data-compact')).toBe('yes')
    // The head: the place, the source and the device one to a line, and no dot between them.
    expect(document.querySelector('[data-panel-meta]')?.children).toHaveLength(3)
    expect(document.querySelector('[data-panel-head]')?.textContent).not.toContain('·')
  })

  it('keeps the list\'s own steps when it stands alone', () => {
    blockOf(SPLIT_FROM - 1)
    render(<VisitorsList {...base} rows={[row(1)]} total={1} page={1} onPage={() => {}} />)
    expect(headOf('Place').className).toContain('cq-[960px]:block')
    expect(headOf('Source').className).toContain('cq-[1180px]:block')
    expect(document.querySelector('[data-visitor-events]')?.className).toContain('cq-[960px]:inline-flex')
    expect(document.querySelector('[data-visitor-visits]')?.className).toContain('inline-flex')
    expect(headOf('Visitor').className).not.toContain('min-w-[212px]')
    expect(root().getAttribute('data-split-fold')).toBeNull()
  })

  it('folds the panel into a strip with », and the strip opens it again on the same visitor', () => {
    blockOf(1200)
    render(<VisitorsList {...base} rows={[row(1), row(2)]} total={2} page={1} onPage={() => {}} />)
    press('key-1')
    expect(fold()).toBe('open')
    fireEvent.click(screen.getByRole('button', { name: 'Fold the panel' }))
    expect(fold()).toBe('shut')
    expect(root().className).toContain('grid-cols-[minmax(0,1fr)_44px]')
    expect(opened()).toEqual([])
    expect(panel()).toBe('key-1')
    const strip = document.querySelector('[data-split-strip]') as HTMLElement
    expect(strip.getAttribute('aria-label')).toMatch(/^Show .+ beside the list$/)
    expect(strip.getAttribute('aria-label')).not.toBe('Show the panel beside the list')
    fireEvent.click(strip)
    expect(fold()).toBe('open')
    expect(opened()).toEqual(['key-1'])
  })

  it('folds the waiting panel on Esc into a strip holding only its caret, and the strip opens it again still waiting', () => {
    blockOf(1200)
    render(<VisitorsList {...base} rows={[row(1), row(2)]} total={2} page={1} onPage={() => {}} />)
    waiting()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(fold()).toBe('shut')
    expect(panel()).toBe('')
    expect(opened()).toEqual([])
    const strip = document.querySelector('[data-split-strip]') as HTMLElement
    expect(strip.getAttribute('aria-label')).toBe('Show the panel beside the list')
    expect(strip.textContent).toBe('')
    // From the keyboard the focus goes to the line saying to press a visitor: the strip it was on is gone.
    strip.focus()
    fireEvent.click(strip)
    expect(fold()).toBe('open')
    waiting()
    expect(document.activeElement).toBe(empty())
  })

  it('folds on Esc, never on an Esc that closes something else, is typed in a field or was handled', () => {
    blockOf(1200)
    render(<VisitorsList {...base} rows={[row(1), row(2)]} total={2} page={1} onPage={() => {}} />)
    // An Esc closing a menu: its trigger is still expanded while the press is dispatched (somethingIsOpen).
    const menu = document.createElement('button')
    menu.setAttribute('aria-expanded', 'true')
    document.body.appendChild(menu)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(fold()).toBe('open')
    menu.remove()
    const field = document.createElement('input')
    document.body.appendChild(field)
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(fold()).toBe('open')
    field.remove()
    act(() => {
      const handled = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      handled.preventDefault()
      window.dispatchEvent(handled)
    })
    expect(fold()).toBe('open')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(fold()).toBe('shut')
  })

  it('opens a folded panel on the visitor a row press picks, and stays folded across a new page', async () => {
    blockOf(1200)
    const { rerender } = render(<VisitorsList {...base} rows={[row(1), row(2), row(3)]} total={60} page={1} onPage={() => {}} />)
    press('key-1')
    fireEvent.click(screen.getByRole('button', { name: 'Fold the panel' }))
    press('key-3')
    expect(fold()).toBe('open')
    expect(opened()).toEqual(['key-3'])
    fireEvent.click(screen.getByRole('button', { name: 'Fold the panel' }))
    // The next page arrives folded, and nobody is picked: the strip holds only its caret.
    rerender(<VisitorsList {...base} rows={[row(4), row(5)]} total={60} page={2} arrival="last_seen.desc.2" onPage={() => {}} />)
    expect(fold()).toBe('shut')
    expect(panel()).toBe('')
    expect(document.querySelector('[data-split-strip]')?.getAttribute('aria-label')).toBe('Show the panel beside the list')
    await waitFor(() => expect(document.querySelector('[data-visitor-line="key-5"]')).not.toBeNull())
    press('key-5')
    expect(fold()).toBe('open')
    expect(opened()).toEqual(['key-5'])
  })

  it('hands the focus to the strip on a fold from the keyboard and back to » on an unfold, and leaves a pointer\'s focus be', () => {
    blockOf(1200)
    render(<VisitorsList {...base} rows={[row(1), row(2)]} total={2} page={1} onPage={() => {}} />)
    press('key-1')
    const button = screen.getByRole('button', { name: 'Fold the panel' })
    button.focus()
    fireEvent.click(button)
    expect(document.activeElement).toBe(document.querySelector('[data-split-strip]'))
    fireEvent.click(document.activeElement as HTMLElement)
    expect(document.activeElement).toBe(document.querySelector('[data-panel-fold]'))
    // A press with the focus elsewhere (a pointer on the page) moves nothing.
    ;(document.activeElement as HTMLElement).blur()
    fireEvent.click(screen.getByRole('button', { name: 'Fold the panel' }))
    expect(document.activeElement).toBe(document.body)
  })
})
