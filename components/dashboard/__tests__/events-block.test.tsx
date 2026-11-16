import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import ContentSignals from '@/components/dashboard/ContentSignals'
import ContentStats from '@/components/dashboard/ContentStats'
import { ROW_NUMBER } from '@/components/dashboard/MetricRowStat'
import { DashboardFrameProvider, FRAME_CARD } from '@/lib/dashboard/frame'
import type { GoalCountStat } from '@/lib/api/stats'

// ---------------------------------------------------------------------------
// THE EVENTS BLOCK OF THE NEW DASHBOARD FRAME (components/dashboard/events/), and the Pages tab's sorting beside it.
//
// Each ruling the block carries is pinned here (design Pulse/docs/plans/14-11-2026-dashboard-overhaul-2-plan.md
// §10t, §10ad): the list beside the picked event's properties, an opened event inside its block (R34), goals and
// events one list (R37), names at the text's normal weight, the conversion a grey number, no orange line on the
// picked row, orange tabs in the pane (R41), the caret on every row and sorting by a column's name (R41, R51).
// Today's arrangement (no frame) is pinned unchanged at the end.
// ---------------------------------------------------------------------------

vi.mock('framer-motion', () => import('@/components/settings/__tests__/framer-mock'))
vi.mock('@/lib/skeleton/band', () => ({ registerBar: () => () => undefined }))

const h = vi.hoisted(() => ({
  useEventPropertyKeys: vi.fn(),
  useEventPropertyValues: vi.fn(),
  usePagePreview: vi.fn(),
  useFullDimensionList: vi.fn(),
}))
vi.mock('@/lib/swr/dashboard', () => ({
  useEventPropertyKeys: (...a: unknown[]) => h.useEventPropertyKeys(...a),
  useEventPropertyValues: (...a: unknown[]) => h.useEventPropertyValues(...a),
  usePagePreview: (...a: unknown[]) => h.usePagePreview(...a),
  useFullDimensionList: (...a: unknown[]) => h.useFullDimensionList(...a),
}))

const dateRange = { start: '2026-11-08', end: '2026-11-14' }
const totals = { pageviews: 2000, visitors: 400 }
const MOBILE = 'v2:device|is|mobile'

// Visitors and events order the site's own events differently, so every sort is seen.
const goalCounts: GoalCountStat[] = [
  { event_name: 'outbound_link', count: 70, visitors: 30 },
  { event_name: 'add_to_cart', count: 300, visitors: 60 },
  // A goal: an event with a name of its own (R37).
  { event_name: 'signup', count: 120, visitors: 80, display_name: 'Signed up' },
  { event_name: 'purchase', count: 40, visitors: 40 },
  { event_name: 'pulse_click', count: 25, visitors: 10 },
  { event_name: 'newsletter', count: 50, visitors: 20 },
]
const KEYS: Record<string, Array<{ key: string; count: number }>> = {
  signup: [{ key: 'plan', count: 100 }, { key: 'source', count: 60 }],
  add_to_cart: [{ key: 'category', count: 300 }],
  // The server's order (both keys on every click): the pane puts the link first.
  outbound_link: [{ key: 'page_path', count: 70 }, { key: 'url', count: 70 }],
}
const VALUES: Record<string, Array<{ value: string; count: number }>> = {
  'signup|plan': [{ value: 'pro', count: 50 }, { value: 'team', count: 30 }, { value: 'free', count: 20 }],
  'signup|source': [{ value: 'https://www.example.org/', count: 40 }, { value: 'newsletter', count: 20 }],
  'add_to_cart|category': [{ value: 'shoes', count: 200 }, { value: 'bags', count: 100 }],
  'outbound_link|url': [{ value: 'https://docs.example/start', count: 70 }],
}

const answer = <T,>(data: T) => ({ data, error: undefined, isLoading: false, isValidating: false, mutate: vi.fn(), available: true })
const idle = { data: undefined, error: undefined, isLoading: false, mutate: vi.fn() }

beforeEach(() => {
  h.useEventPropertyKeys.mockReset().mockImplementation((_site: string, event: string | null) => answer(event === null ? undefined : KEYS[event] ?? []))
  h.useEventPropertyValues.mockReset().mockImplementation((_site: string, event: string | null, key: string | null) =>
    answer(event === null || key === null ? undefined : VALUES[`${event}|${key}`] ?? []))
  h.usePagePreview.mockReset().mockReturnValue({ data: null })
  h.useFullDimensionList.mockReset().mockReturnValue(idle)
})

const inFrame = (ui: React.ReactElement) => render(<DashboardFrameProvider>{ui}</DashboardFrameProvider>)
const block = (over: Partial<React.ComponentProps<typeof ContentSignals>> = {}) => (
  <ContentSignals goalCounts={goalCounts} siteId="site-1" dateRange={dateRange} totals={totals} {...over} />
)
const card = () => document.querySelector('[data-tour-card="content-signals"]') as HTMLElement
const listPane = () => card().querySelector('[data-events-pane="list"]') as HTMLElement
const propsPane = () => card().querySelector('[data-events-pane="properties"]') as HTMLElement
const classes = (el: Element) => new Set((el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean))

const rows = () => [...listPane().querySelectorAll<HTMLElement>('[data-event]')]
const rowNames = () => rows().map((r) => r.querySelector('.truncate')?.textContent)
const row = (name: string) => {
  const found = rows().find((r) => r.querySelector('.truncate')?.textContent === name)
  expect(found, `a row named "${name}" among ${JSON.stringify(rowNames())}`).toBeTruthy()
  return found as HTMLElement
}
const press = (name: string) => fireEvent.click(within(row(name)).getByRole('button', { name: `Show the properties of ${name}` }))
const sortBy = (pane: HTMLElement, column: string) => fireEvent.click(within(pane).getByRole('button', { name: new RegExp(`^Sort by ${column},`) }))
const valueRows = () => [...propsPane().querySelectorAll<HTMLElement>('[data-event-value]')]
const values = () => valueRows().map((r) => r.querySelector('.truncate')?.textContent)
/** The bar of a row: drawn under its name. */
const barOf = (el: HTMLElement) => el.querySelector('[aria-hidden="true"][class*="inset-y-0.5"]') as HTMLElement
const caretOf = (el: HTMLElement) => el.querySelector('[data-cue] svg') as SVGElement

describe('the Events block in the new frame: the list beside the picked event\'s properties', () => {
  it('is ONE block of the frame\'s size across both columns, holding two panes, and the tour still finds it', () => {
    inFrame(block())
    for (const c of FRAME_CARD.split(' ')) expect(classes(card()).has(c), c).toBe(true)
    expect(card().getAttribute('data-tour')).toBe('dimension-card')
    const grid = card().firstElementChild as HTMLElement
    expect(classes(grid).has('lg:grid-cols-2')).toBe(true)
    expect([...grid.children].map((s) => s.getAttribute('data-events-pane'))).toEqual(['list', 'properties'])
  })

  it('lists the site\'s own events and the automatic ones on two tabs; a goal is a row of the one list under its own name (R37)', () => {
    inFrame(block())
    expect(within(listPane()).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Your events', 'Automatic'])
    // No Goals tab anywhere: a goal is an event with a name of its own.
    expect(screen.queryByRole('radio', { name: /goal/i })).toBeNull()
    expect(rowNames()).toEqual(['Signed up', 'Add to cart', 'Purchase', 'Newsletter'])
    fireEvent.click(within(listPane()).getByRole('radio', { name: 'Automatic' }))
    expect(rowNames()).toEqual(['Outbound clicks', 'Clicks'])
  })

  it('gives a row who did it, how often, and its conversion, the share of the range\'s visitors who did it', () => {
    inFrame(block())
    const cells = (name: string) => [...row(name).querySelectorAll('.tabular-nums')].map((c) => c.textContent)
    expect(cells('Signed up')).toEqual(['80', '120', '20%'])
    expect(cells('Newsletter')).toEqual(['20', '50', '5.0%'])
    expect([...listPane().querySelectorAll('[data-sort]')].map((b) => b.textContent)).toEqual(['visitors', 'events', 'conversion'])
  })

  it('writes a dash for the conversion when the range\'s visitors are not known, never 0%', () => {
    inFrame(block({ totals: undefined }))
    expect(row('Signed up').querySelector('[data-conversion]')?.textContent).toBe('—')
  })

  it('names a row in white at the text\'s normal weight, as the other blocks do (R41)', () => {
    inFrame(block())
    for (const r of rows()) {
      const name = classes(r.querySelector('.truncate') as HTMLElement)
      expect(name.has('text-sm') && name.has('text-white')).toBe(true)
      for (const weight of ['font-medium', 'font-semibold', 'font-bold']) expect(name.has(weight), weight).toBe(false)
    }
  })

  it('draws the conversion as the blocks\' grey number, never a white one of its own (R41)', () => {
    inFrame(block())
    for (const r of rows()) {
      const conversion = classes(r.querySelector('[data-conversion]') as HTMLElement)
      for (const c of ROW_NUMBER.split(' ')) expect(conversion.has(c), c).toBe(true)
      expect(conversion.has('text-white')).toBe(false)
    }
  })

  it('marks the picked row by its lit bar and a neutral tint, with no orange line (R41)', () => {
    inFrame(block())
    const picked = row('Signed up')
    expect(picked.hasAttribute('data-picked')).toBe(true)
    expect(classes(picked).has('bg-white/[0.04]')).toBe(true)
    expect(classes(barOf(picked)).has('bg-brand-orange/[0.26]')).toBe(true)
    expect(classes(barOf(row('Purchase'))).has('bg-brand-orange/[0.16]')).toBe(true)
    // No line of any kind: no border on a side, and no solid orange anywhere in the row.
    for (const el of [picked, ...picked.querySelectorAll('*')]) {
      for (const c of classes(el)) {
        expect(c.startsWith('border-l') || c.startsWith('border-s'), `${c} in the picked row`).toBe(false)
        expect(c === 'bg-brand-orange' || c === 'bg-primary', `${c} in the picked row`).toBe(false)
      }
    }
  })

  it('ends EVERY row with the caret, orange on the event shown in the pane, grey on the others (R51)', () => {
    inFrame(block())
    const carets = () => rows().map((r) => caretOf(r))
    expect(carets().every(Boolean)).toBe(true)
    expect(carets().map((c) => classes(c).has('text-brand-ink'))).toEqual([true, false, false, false])
    expect(classes(caretOf(row('Purchase'))).has('text-neutral-600')).toBe(true)
    press('Purchase')
    expect(carets().map((c) => classes(c).has('text-brand-ink'))).toEqual([false, false, true, false])
    // The header keeps the caret's room, so the column names stay over their numbers.
    const head = listPane().querySelector('[data-sort-head]')?.parentElement as HTMLElement
    expect(head.lastElementChild?.getAttribute('aria-hidden')).toBe('true')
    expect(classes(head.lastElementChild as HTMLElement).has('w-4')).toBe(true)
  })

  it('opens a pressed event INSIDE the block: the pane beside the list shows it, and nothing grows or floats (R34)', () => {
    inFrame(block())
    press('Add to cart')
    const pane = propsPane()
    expect(card().contains(pane)).toBe(true)
    expect(within(pane).getByRole('heading', { name: 'Add to cart' })).toBeTruthy()
    expect(values()).toEqual(['shoes', 'bags'])
    // Its values are drawn in the block and nowhere else: no pop-up, no portal.
    for (const el of screen.getAllByText('shoes')) expect(card().contains(el)).toBe(true)
    // The row says it is the one shown; no row opens under itself any more.
    expect(within(row('Add to cart')).getByRole('button').getAttribute('aria-pressed')).toBe('true')
    expect(within(row('Signed up')).getByRole('button').getAttribute('aria-pressed')).toBe('false')
    expect(rows().some((r) => r.hasAttribute('aria-expanded') || r.querySelector('[aria-expanded]') !== null)).toBe(false)
    expect(classes(card()).has('h-[442px]')).toBe(true)
  })

  it('shows the first event of the page at rest, so the pane is never empty', () => {
    inFrame(block())
    expect(within(propsPane()).getByRole('heading', { name: 'Signed up' })).toBeTruthy()
    expect(values()).toEqual(['pro', 'team', 'free'])
  })

  it('gives the pane\'s properties orange tabs, as every block\'s tabs are (R41)', () => {
    inFrame(block())
    const tabs = within(propsPane()).getByRole('radiogroup', { name: 'Properties of Signed up' })
    expect(within(tabs).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Plan', 'Source'])
    expect(tabs.querySelector('[data-facet-switcher-thumb]')?.getAttribute('data-tone')).toBe('solid')
    // The list's tabs too.
    expect(within(listPane()).getByRole('radiogroup', { name: 'Events view' }).querySelector('[data-facet-switcher-thumb]')?.getAttribute('data-tone')).toBe('solid')
  })

  it('shows one property at a time, each value with its events and its share of the events that carry the property', () => {
    inFrame(block())
    const shares = () => valueRows().map((r) => [...r.querySelectorAll('.tabular-nums')].map((c) => c.textContent))
    expect(shares()).toEqual([['50', '50%'], ['30', '30%'], ['20', '20%']])
    fireEvent.click(within(propsPane()).getByRole('radio', { name: 'Source' }))
    // A link reads without its scheme and www., and carries its site's icon; its share is of the 60 that carry it.
    expect(values()).toEqual(['example.org', 'newsletter'])
    expect(valueRows()[0].querySelector('img, svg')).toBeTruthy()
    expect(valueRows()[1].querySelector('img, svg')).toBeNull()
    expect(shares()).toEqual([['40', '67%'], ['20', '33%']])
  })

  it('opens an automatic event on its link, the tracker\'s keys in reading order under their own words', () => {
    inFrame(block())
    fireEvent.click(within(listPane()).getByRole('radio', { name: 'Automatic' }))
    expect(within(propsPane()).getByRole('heading', { name: 'Outbound clicks' })).toBeTruthy()
    expect(within(propsPane()).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Link', 'Page'])
    expect(values()).toEqual(['docs.example/start'])
  })

  it('sorts the list by visitors, events or conversion: high to low first, then low to high (R41, R51)', () => {
    inFrame(block())
    const list = listPane()
    expect(rowNames()).toEqual(['Signed up', 'Add to cart', 'Purchase', 'Newsletter'])
    // Visitors is the sorted column at rest, high to low: a press turns it.
    sortBy(list, 'visitors')
    expect(rowNames()).toEqual(['Newsletter', 'Purchase', 'Add to cart', 'Signed up'])
    sortBy(list, 'events')
    expect(rowNames()).toEqual(['Add to cart', 'Signed up', 'Newsletter', 'Purchase'])
    sortBy(list, 'events')
    expect(rowNames()).toEqual(['Purchase', 'Newsletter', 'Signed up', 'Add to cart'])
    // Conversion is visitors over one total: it orders as visitors do.
    sortBy(list, 'conversion')
    expect(rowNames()).toEqual(['Signed up', 'Add to cart', 'Purchase', 'Newsletter'])
    sortBy(list, 'conversion')
    expect(rowNames()).toEqual(['Newsletter', 'Purchase', 'Add to cart', 'Signed up'])
    sortBy(list, 'visitors')
    expect(rowNames()).toEqual(['Signed up', 'Add to cart', 'Purchase', 'Newsletter'])
  })

  it('sorts the picked event\'s values by events or share: high to low first, then low to high (R41, R51)', () => {
    inFrame(block())
    const pane = propsPane()
    expect(values()).toEqual(['pro', 'team', 'free'])
    sortBy(pane, 'events')
    expect(values()).toEqual(['free', 'team', 'pro'])
    sortBy(pane, 'share')
    expect(values()).toEqual(['pro', 'team', 'free'])
    sortBy(pane, 'share')
    expect(values()).toEqual(['free', 'team', 'pro'])
  })

  it('keeps rows that tie in the server\'s order, in both directions', () => {
    const tied: GoalCountStat[] = [
      { event_name: 'zeta', count: 10, visitors: 10 },
      { event_name: 'mid', count: 20, visitors: 15 },
      { event_name: 'alpha', count: 10, visitors: 10 },
    ]
    h.useEventPropertyKeys.mockImplementation((_site: string, event: string | null) => answer(event === null ? undefined : [{ key: 'kind', count: 19 }]))
    // The server sends the most counted first; x and y tie, and x came first.
    h.useEventPropertyValues.mockImplementation((_site: string, event: string | null, key: string | null) =>
      answer(event === null || key === null ? undefined : [{ value: 'z', count: 9 }, { value: 'x', count: 5 }, { value: 'y', count: 5 }]))
    inFrame(block({ goalCounts: tied }))
    expect(rowNames()).toEqual(['Mid', 'Zeta', 'Alpha'])
    sortBy(listPane(), 'visitors')
    expect(rowNames()).toEqual(['Zeta', 'Alpha', 'Mid'])
    sortBy(listPane(), 'events')
    expect(rowNames()).toEqual(['Mid', 'Zeta', 'Alpha'])
    sortBy(listPane(), 'events')
    expect(rowNames()).toEqual(['Zeta', 'Alpha', 'Mid'])
    // The picked event's values.
    press('Zeta')
    sortBy(propsPane(), 'events')
    expect(values()).toEqual(['x', 'y', 'z'])
    sortBy(propsPane(), 'share')
    expect(values()).toEqual(['z', 'x', 'y'])
  })

  it('reads the picked event\'s properties under the page\'s filters and its live window, and reads nothing else', () => {
    inFrame(block({ filters: MOBILE }))
    expect(h.useEventPropertyKeys).toHaveBeenLastCalledWith('site-1', 'signup', dateRange.start, dateRange.end, MOBILE, undefined, undefined)
    expect(h.useEventPropertyValues).toHaveBeenLastCalledWith('site-1', 'signup', 'plan', dateRange.start, dateRange.end, 100, MOBILE, undefined, undefined)
    press('Purchase')
    expect(h.useEventPropertyKeys).toHaveBeenLastCalledWith('site-1', 'purchase', dateRange.start, dateRange.end, MOBILE, undefined, undefined)
  })

  it('hands the page\'s period to the pane\'s reads: All time travels as its token (16-11-2026)', () => {
    inFrame(block({ filters: MOBILE, period: 'all' }))
    expect(h.useEventPropertyKeys).toHaveBeenLastCalledWith('site-1', 'signup', dateRange.start, dateRange.end, MOBILE, undefined, 'all')
    expect(h.useEventPropertyValues).toHaveBeenLastCalledWith('site-1', 'signup', 'plan', dateRange.start, dateRange.end, 100, MOBILE, undefined, 'all')
  })

  it('in a live window the pane\'s reads carry the minutes with the filters', () => {
    inFrame(block({ filters: MOBILE, liveMinutes: 5 }))
    expect(h.useEventPropertyKeys).toHaveBeenLastCalledWith('site-1', 'signup', dateRange.start, dateRange.end, MOBILE, 5, undefined)
    expect(h.useEventPropertyValues).toHaveBeenLastCalledWith('site-1', 'signup', 'plan', dateRange.start, dateRange.end, 100, MOBILE, 5, undefined)
  })

  it('says an event counted from imported days alone carries no properties, and asks for none', () => {
    inFrame(block({ goalCounts: [{ event_name: 'signup', count: 50, visitors: 40, instrument: 'imported' }] }))
    expect(propsPane().textContent).toContain('Imported days carry no properties')
    expect(h.useEventPropertyKeys).toHaveBeenLastCalledWith('site-1', null, dateRange.start, dateRange.end, undefined, undefined, undefined)
    expect(h.useEventPropertyValues).toHaveBeenLastCalledWith('site-1', 'signup', null, dateRange.start, dateRange.end, 100, undefined, undefined, undefined)
  })

  it('holds the rows\' place while the properties are read, and says when there are none or the read failed', () => {
    h.useEventPropertyKeys.mockImplementation(() => answer(undefined))
    const view = inFrame(block())
    expect(within(propsPane()).getByTestId('event-properties-loading')).toBeTruthy()
    view.unmount()

    h.useEventPropertyKeys.mockImplementation(() => answer([]))
    const none = inFrame(block())
    expect(propsPane().textContent).toContain('No properties were sent with this event')
    none.unmount()

    h.useEventPropertyKeys.mockImplementation(() => ({ ...answer(undefined), error: new Error('boom') }))
    inFrame(block())
    expect(propsPane().textContent).toContain('The properties of this event could not be loaded. Reload the page to try again.')
  })

  it('on a share link the block is the list alone: nothing to press, no caret, no pane, no read', () => {
    inFrame(block({ memberFeatures: false }))
    expect(rowNames()).toEqual(['Signed up', 'Add to cart', 'Purchase', 'Newsletter'])
    expect(within(card()).queryAllByRole('button', { name: /^Show the properties/ })).toHaveLength(0)
    expect(card().querySelector('[data-cue]')).toBeNull()
    expect(propsPane()).toBeNull()
    expect(classes(card().firstElementChild as HTMLElement).has('lg:grid-cols-2')).toBe(false)
    expect(rows().some((r) => classes(r).has('interactive-row'))).toBe(false)
    expect(h.useEventPropertyKeys).not.toHaveBeenCalled()
    expect(h.useEventPropertyValues).not.toHaveBeenCalled()
    // Its rows still sort.
    sortBy(listPane(), 'events')
    expect(rowNames()).toEqual(['Add to cart', 'Signed up', 'Newsletter', 'Purchase'])
  })

  it('with no events each tab says so in its own words, and the pane says what it will show', () => {
    inFrame(block({ goalCounts: [] }))
    expect(listPane().textContent).toContain('No events in this range')
    expect(listPane().querySelector('[data-sort-head]')).toBeNull()
    expect(propsPane().textContent).toBe("An event's properties show here.")
    fireEvent.click(within(listPane()).getByRole('radio', { name: 'Automatic' }))
    expect(listPane().textContent).toContain('No automatic events in this range')
  })

  it('pages the list seven at a time, and the pane always belongs to a row on the page', () => {
    const many: GoalCountStat[] = Array.from({ length: 9 }, (_, i) => ({ event_name: `event_${String.fromCharCode(97 + i)}`, count: 100 - i, visitors: 90 - i }))
    inFrame(block({ goalCounts: many }))
    expect(rows()).toHaveLength(7)
    press('Event c')
    expect(within(propsPane()).getByRole('heading', { name: 'Event c' })).toBeTruthy()
    fireEvent.click(within(listPane()).getByRole('button', { name: 'Next page' }))
    expect(rowNames()).toEqual(['Event h', 'Event i'])
    expect(within(propsPane()).getByRole('heading', { name: 'Event h' })).toBeTruthy()
  })

  it('says when imported days are in its numbers, on the footer row beside the pager', () => {
    const many: GoalCountStat[] = Array.from({ length: 9 }, (_, i) => ({ event_name: `event_${i}`, count: 100 - i, visitors: 90 - i }))
    inFrame(block({ goalCounts: many, goalsImported: { included: true } as never }))
    const footer = within(listPane()).getByTestId('card-footer')
    const word = within(footer).getByTestId('events-imported-word')
    expect(word.textContent).toBe('incl. imported days')
    expect([...footer.children]).toEqual([word, within(footer).getByRole('navigation', { name: 'Pages of events' })])
  })

  it('below `lg` a press puts the pane in the list\'s place, and Back brings the list again', () => {
    inFrame(block())
    expect(classes(listPane()).has('hidden')).toBe(false)
    expect(['hidden', 'lg:flex'].every((c) => classes(propsPane()).has(c))).toBe(true)
    press('Purchase')
    expect(['hidden', 'lg:flex'].every((c) => classes(listPane()).has(c))).toBe(true)
    expect(classes(propsPane()).has('hidden')).toBe(false)
    fireEvent.click(within(propsPane()).getByRole('button', { name: 'Back to the events' }))
    expect(classes(listPane()).has('hidden')).toBe(false)
    expect(within(propsPane()).getByRole('heading', { name: 'Purchase' })).toBeTruthy()
  })
})

describe('the Pages block in the new frame: the Pages tab sorts by its two columns', () => {
  const pages = [
    { path: '/a', visitors: 50, pageviews: 60, bounce_rate: null, avg_duration: null },
    { path: '/b', visitors: 40, pageviews: 200, bounce_rate: null, avg_duration: null },
    { path: '/c', visitors: 30, pageviews: 30, bounce_rate: null, avg_duration: null },
    { path: '/d', visitors: 30, pageviews: 30, bounce_rate: null, avg_duration: null },
  ]
  const pagesBlock = () => (
    <ContentStats topPages={pages} entryPages={pages} exitPages={[]} domain="example.com" siteId="site-1" dateRange={dateRange} totals={totals} />
  )
  const pagesCard = () => document.querySelector('[data-tour-card="content"]') as HTMLElement
  const paths = () => [...pagesCard().querySelectorAll('.interactive-row .truncate')].map((el) => el.textContent)

  it('sorts the pages by views or visitors: high to low first, then low to high, ties in the server\'s order (R41)', () => {
    inFrame(pagesBlock())
    expect(paths()).toEqual(['/a', '/b', '/c', '/d'])
    expect([...pagesCard().querySelectorAll('[data-sort]')].map((b) => b.getAttribute('aria-label'))).toEqual([
      'Sort by visitors, low to high',
      'Sort by views, high to low',
    ])
    sortBy(pagesCard(), 'views')
    expect(paths()).toEqual(['/b', '/a', '/c', '/d'])
    sortBy(pagesCard(), 'views')
    expect(paths()).toEqual(['/c', '/d', '/a', '/b'])
    sortBy(pagesCard(), 'visitors')
    expect(paths()).toEqual(['/a', '/b', '/c', '/d'])
    sortBy(pagesCard(), 'visitors')
    expect(paths()).toEqual(['/c', '/d', '/b', '/a'])
  })

  it('draws the column names in the columns and gap of the numbers under them', () => {
    inFrame(pagesBlock())
    const head = pagesCard().querySelector('[data-sort-head]') as HTMLElement
    expect(classes(head).has('gap-2')).toBe(true)
    for (const b of head.querySelectorAll('[data-sort]')) expect(classes(b).has('w-12'), b.textContent ?? '').toBe(true)
  })

  it('sorts the Entries tab by its one column, in an order of its own (16-11-2026)', () => {
    inFrame(pagesBlock())
    sortBy(pagesCard(), 'views')
    fireEvent.click(within(pagesCard()).getByRole('radio', { name: 'Entries' }))
    // One name, visitors, as the plain label was; the Pages tab's views order does not follow it here.
    expect([...pagesCard().querySelectorAll('[data-sort]')].map((b) => b.getAttribute('aria-label'))).toEqual(['Sort by visitors, low to high'])
    expect(within(pagesCard()).queryByTestId('metric-unit')).toBeNull()
    expect(paths()).toEqual(['/a', '/b', '/c', '/d'])
    sortBy(pagesCard(), 'visitors')
    expect(paths()).toEqual(['/c', '/d', '/b', '/a'])
    // Back on Pages, its own order is still views, high to low.
    fireEvent.click(within(pagesCard()).getByRole('radio', { name: 'Pages' }))
    expect(paths()).toEqual(['/b', '/a', '/c', '/d'])
  })
})

describe('today\'s arrangement, outside the frame, is unchanged', () => {
  it('the Events card keeps its two tabs and its rows, with no sorting, no caret and no pane', () => {
    render(block())
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual(['Scroll depth', 'Events'])
    fireEvent.click(screen.getByRole('radio', { name: 'Events' }))
    expect(screen.getAllByTestId('goal-row').map((r) => r.textContent?.replace(/\d+$/, '').trim())).toEqual(
      ['outbound link', 'add to cart', 'Signed up', 'purchase', 'pulse click', 'newsletter'],
    )
    expect(document.querySelector('[data-sort-head], [data-cue], [data-events-pane]')).toBeNull()
    // Today's card reads the page capture for the site, as it always did; the new block never does.
    expect(h.usePagePreview.mock.calls[0][0]).toBe('site-1')
    expect(h.useEventPropertyKeys).not.toHaveBeenCalled()
  })

  it('the new block never reads the page capture, which was the scroll tab\'s alone', () => {
    inFrame(block())
    expect(h.usePagePreview).not.toHaveBeenCalled()
  })

  it('the Pages tab keeps its two plain labels and the server\'s order', () => {
    const pages = [
      { path: '/a', visitors: 50, pageviews: 60, bounce_rate: null, avg_duration: null },
      { path: '/b', visitors: 40, pageviews: 200, bounce_rate: null, avg_duration: null },
    ]
    render(<ContentStats topPages={pages} entryPages={[]} exitPages={[]} domain="example.com" siteId="site-1" dateRange={dateRange} totals={totals} />)
    const label = screen.getByTestId('metric-unit')
    expect([...label.children].map((c) => c.textContent)).toEqual(['visitors', 'views'])
    expect(label.querySelector('button')).toBeNull()
    expect(document.querySelector('[data-sort-head]')).toBeNull()
    expect([...document.querySelectorAll('.interactive-row .truncate')].map((el) => el.textContent)).toEqual(['/a', '/b'])
  })
})
