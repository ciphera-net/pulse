import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react'
import ContentStats from '@/components/dashboard/ContentStats'
import { OUTBOUND_NATIVE_ONLY } from '@/components/dashboard/OutboundLinksTab'
import { DashboardFrameProvider } from '@/lib/dashboard/frame'
import { EmptyFactsProvider } from '@/lib/dashboard/emptyFacts'

// ---------------------------------------------------------------------------
// Outbound's links as the Pages block's fourth tab (the new dashboard frame, 15-11-2026).
//
// "Move outbound links to the Pages, Entries, Exits block. Only the links, and consistent with the styling of the
// pages block." So: a tab of this block, drawn with this block's rows, and nothing of the Outbound card's own look
// except what is a fact (clicks, a row opens its link, the notes). Outside the frame the block is today's.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  useFullDimensionList: vi.fn(),
  useOutboundUrls: vi.fn(),
  preload: vi.fn(),
}))

vi.mock('@/lib/swr/dashboard', () => ({
  useFullDimensionList: (...a: unknown[]) => h.useFullDimensionList(...a),
  useOutboundUrls: (...a: unknown[]) => h.useOutboundUrls(...a),
}))
vi.mock('@/lib/hooks/usePreloadImages', () => ({ usePreloadImages: (...a: unknown[]) => h.preload(...a) }))
// Data behaviour, not motion: the cascade renders plain so no exit animation holds a row in jsdom.
vi.mock('@/components/dashboard/Cascade', () => ({
  CascadeGroup: ({ className, children }: { className?: string; children: React.ReactNode }) => <div className={className}>{children}</div>,
  CascadeRow: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  RowBar: ({ width }: { width: number }) => <div data-testid="row-bar" data-width={width} />,
}))

const idle = { data: undefined, error: undefined, isLoading: false, mutate: vi.fn() }
const dateRange = { start: '2026-11-08', end: '2026-11-14' }
const totals = { pageviews: 453, visitors: 314 }
const pages = Array.from({ length: 3 }, (_, i) => ({ path: `/page-${i}`, pageviews: 100 - i, visitors: 80 - i, bounce_rate: null, avg_duration: null }))
const urls = [
  { value: 'https://www.strava.com/clubs/haldencycles', count: 443 },
  { value: 'https://instagram.com/haldencycles/', count: 335 },
  { value: 'https://komoot.com/collection/halden-gravel-loops', count: 322 },
  { value: 'https://www.youtube.com/@haldencycles', count: 176 },
]
const goalCounts = [{ event_name: 'outbound_link', count: 1276, native_count: 1276, visitors: 900 }]

type Outbound = NonNullable<React.ComponentProps<typeof ContentStats>['outbound']>
const block = (outbound: Outbound | undefined = { period: '7d', goalCounts: goalCounts as Outbound['goalCounts'] }, extra: Partial<React.ComponentProps<typeof ContentStats>> = {}) => (
  <ContentStats topPages={pages} entryPages={[]} exitPages={[]} domain="example.com" siteId="site-1" dateRange={dateRange} totals={totals} onFilter={() => {}} outbound={outbound} {...extra} />
)
const inFrame = (ui: React.ReactElement) => render(<DashboardFrameProvider>{ui}</DashboardFrameProvider>)
const card = () => document.querySelector('[data-tour-card="content"]') as HTMLElement
const tabs = () => screen.getAllByRole('radio').map((t) => t.textContent)
const openOutbound = () => fireEvent.click(screen.getByRole('radio', { name: 'Outbound' }))
const rows = () => [...card().querySelectorAll<HTMLElement>('.interactive-row')]
/** The header's unit: a plain label, or in the frame's Pages tab its two column names, which sort the rows. */
const unit = () => (card().querySelector('[data-testid="metric-unit"], [data-sort-head]') as HTMLElement).textContent

beforeEach(() => {
  h.useFullDimensionList.mockReset().mockReturnValue(idle)
  h.useOutboundUrls.mockReset().mockReturnValue({ data: urls, error: undefined, isLoading: false })
  h.preload.mockReset()
})

describe('where the tab is', () => {
  it('is the fourth tab in the frame, where its read is served', () => {
    inFrame(block())
    expect(tabs()).toEqual(['Pages', 'Entries', 'Exits', 'Outbound'])
  })

  it('is not there on a share link: the block is handed no outbound', () => {
    inFrame(<ContentStats topPages={pages} entryPages={[]} exitPages={[]} domain="example.com" siteId="site-1" dateRange={dateRange} totals={totals} />)
    expect(tabs()).toEqual(['Pages', 'Entries', 'Exits'])
  })

  it('is not there outside the frame, whatever the block is handed: today\'s page keeps its Outbound card', () => {
    render(block())
    expect(tabs()).toEqual(['Pages', 'Entries', 'Exits'])
    expect(h.useOutboundUrls).not.toHaveBeenCalled()
  })

  it('goes back to Pages when the read stops being served under it', () => {
    const view = inFrame(block())
    openOutbound()
    expect(unit()).toBe('Clicks')
    // The same block, handed no outbound any more (a default parameter would put it back: spelled out here).
    view.rerender(
      <DashboardFrameProvider>
        <ContentStats topPages={pages} entryPages={[]} exitPages={[]} domain="example.com" siteId="site-1" dateRange={dateRange} totals={totals} onFilter={() => {}} />
      </DashboardFrameProvider>,
    )
    expect(tabs()).toEqual(['Pages', 'Entries', 'Exits'])
    expect(screen.getByRole('radio', { name: 'Pages' }).getAttribute('aria-checked')).toBe('true')
    expect(rows().map((r) => r.querySelector('.truncate')?.textContent)).toEqual(['/page-0', '/page-1', '/page-2'])
  })
})

describe('what it reads', () => {
  it('nothing until the tab is opened, then the links alone, with the range, the period and the live window', () => {
    inFrame(block({ period: '7d', goalCounts: goalCounts as Outbound['goalCounts'] }, { liveMinutes: undefined }))
    expect(h.useOutboundUrls).not.toHaveBeenCalled()
    openOutbound()
    expect(h.useOutboundUrls).toHaveBeenCalledWith('site-1', '2026-11-08', '2026-11-14', '7d', undefined, undefined)
  })

  it('in realtime it reads the live window', () => {
    inFrame(block(undefined as never, { live: true, liveMinutes: 5, outbound: { goalCounts: [] } }))
    openOutbound()
    expect(h.useOutboundUrls).toHaveBeenCalledWith('site-1', '2026-11-08', '2026-11-14', undefined, 5, undefined)
  })

  it('hands the page\'s filters to the read, so the rows are the clicks that fit them', () => {
    const filters = 'v2:country|is|NO,device|is|desktop'
    inFrame(block(undefined as never, { filters, outbound: { period: '7d', goalCounts: goalCounts as Outbound['goalCounts'] } }))
    openOutbound()
    expect(h.useOutboundUrls).toHaveBeenLastCalledWith('site-1', '2026-11-08', '2026-11-14', '7d', undefined, filters)
    // Match any travels inside the same string, so it reaches the read with no code of its own.
    inFrame(block(undefined as never, { filters: 'any:' + filters, outbound: { period: '7d', goalCounts: goalCounts as Outbound['goalCounts'] } }))
    fireEvent.click(screen.getAllByRole('radio', { name: 'Outbound' }).at(-1) as HTMLElement)
    expect(h.useOutboundUrls).toHaveBeenLastCalledWith('site-1', '2026-11-08', '2026-11-14', '7d', undefined, 'any:' + filters)
  })

  it('does not ask for the pages\' full list while it is open', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ path: `/p-${i}`, pageviews: 100 - i, visitors: 80 - i, bounce_rate: null, avg_duration: null }))
    inFrame(block(undefined as never, { topPages: many, outbound: { goalCounts: [] } }))
    // Nine pages overflow the block: the full list is asked for on the Pages tab...
    expect(h.useFullDimensionList.mock.calls.at(-1)?.[0]).toBe('pages')
    openOutbound()
    // ...and not under Outbound, which is no list of pages.
    expect(h.useFullDimensionList.mock.calls.at(-1)?.[0]).toBeNull()
  })
})

describe('how it is drawn: the block\'s own rows', () => {
  it('counts clicks, in one column, and says so in the header', () => {
    inFrame(block())
    expect(unit()).toBe('VisitorsViews')
    openOutbound()
    expect(unit()).toBe('Clicks')
    // The block's own info glyph, with the list's own sentence.
    expect(within(card()).getByRole('button', { name: 'About Outbound links' })).toBeTruthy()
  })

  it('writes each link as one line: its host and path, most clicked first', () => {
    inFrame(block())
    openOutbound()
    expect(rows().map((r) => r.querySelector('.truncate')?.textContent)).toEqual([
      'strava.com/clubs/haldencycles',
      'instagram.com/haldencycles/',
      'komoot.com/collection/halden-gravel-loops',
      'youtube.com/@haldencycles',
    ])
    // One style for the whole line: no dimmed path, as the Outbound card had.
    expect(rows()[0].querySelector('.truncate')?.children.length).toBe(0)
    expect(rows()[0].querySelector('.truncate')?.getAttribute('title')).toBe('https://www.strava.com/clubs/haldencycles')
  })

  it('is a row of this block: its box, a bar, the share under the pointer and the number, by the shared names', async () => {
    const { DIMENSION_ROW, ROW_NUMBER, ROW_SHARE, ROW_STAT } = await import('@/components/dashboard/MetricRowStat')
    inFrame(block())
    // A Pages row first, to compare the Outbound row with.
    const pageRow = rows()[0]
    openOutbound()
    const row = rows()[0]
    for (const cls of DIMENSION_ROW.split(' ')) expect(row.classList.contains(cls), cls).toBe(true)
    for (const cls of DIMENSION_ROW.split(' ')) expect(pageRow.classList.contains(cls), cls).toBe(true)
    expect(row.querySelector('[data-testid="row-bar"]')).toBeTruthy()
    const stat = row.lastElementChild as HTMLElement
    for (const cls of ROW_STAT.split(' ')) expect(stat.classList.contains(cls), cls).toBe(true)
    const [share, number] = [...stat.children] as HTMLElement[]
    expect(share.className).toBe(ROW_SHARE)
    // 443 of the range's 1,276 outbound clicks.
    expect(share.textContent).toBe('35%')
    for (const cls of ROW_NUMBER.split(' ')) expect(number.classList.contains(cls), cls).toBe(true)
    expect(number.textContent).toBe('443')
  })

  it('draws the longest bar at the house cap and the others against it', () => {
    inFrame(block())
    openOutbound()
    const widths = rows().map((r) => Number(r.querySelector('[data-testid="row-bar"]')?.getAttribute('data-width')))
    expect(widths[0]).toBe(75)
    expect(widths[1]).toBeCloseTo((335 / 443) * 75, 5)
    expect(widths[3]).toBeCloseTo((176 / 443) * 75, 5)
  })

  it('takes the share from every outbound click of the range, the native ones where the server tells them apart', () => {
    inFrame(block({ goalCounts: [{ event_name: 'outbound_link', count: 5000, native_count: 886, visitors: 1 }] as Outbound['goalCounts'] }))
    openOutbound()
    // 443 of 886 native clicks, not of 5,000 with an import's added in.
    expect((rows()[0].lastElementChild as HTMLElement).firstElementChild?.textContent).toBe('50%')
  })

  it('falls back to the rows\' own sum when the range\'s count did not arrive', () => {
    inFrame(block({ goalCounts: [] }))
    openOutbound()
    // 443 of 443 + 335 + 322 + 176 = 1,276.
    expect((rows()[0].lastElementChild as HTMLElement).firstElementChild?.textContent).toBe('35%')
  })

  it('a row opens its link in a new tab, and is named for a screen reader', () => {
    inFrame(block())
    openOutbound()
    const row = rows()[0]
    expect(row.tagName).toBe('A')
    expect(row.getAttribute('href')).toBe('https://www.strava.com/clubs/haldencycles')
    expect(row.getAttribute('target')).toBe('_blank')
    expect(row.getAttribute('rel')).toBe('noopener noreferrer')
    expect(row.getAttribute('aria-label')).toBe('Open strava.com/clubs/haldencycles in a new tab')
    // No second control inside it: the whole row is the link.
    expect(row.querySelector('a, button')).toBeNull()
  })

  it('carries the Pages rows\' arrow: hidden at rest, shown by the row, orange under the pointer', () => {
    inFrame(block())
    const pagesArrow = rows()[0].querySelector('a[aria-label^="Open "]') as HTMLElement
    openOutbound()
    const arrow = rows()[0].querySelector('[data-testid="outbound-link-arrow"]') as HTMLElement
    const cls = new Set(arrow.className.split(/\s+/))
    for (const c of ['opacity-0', 'group-hover:opacity-100', '[@media(hover:none)]:opacity-100', 'text-neutral-500', 'hover:text-brand-ink', 'p-1', '-m-1', 'shrink-0']) expect(cls.has(c), c).toBe(true)
    // The same states as the arrow of a Pages row, class for class (the Pages one is a control and has more).
    for (const c of ['opacity-0', 'group-hover:opacity-100', '[@media(hover:none)]:opacity-100', 'text-neutral-500', 'hover:text-brand-ink', 'p-1', '-m-1', 'shrink-0']) expect(pagesArrow.classList.contains(c), `pages: ${c}`).toBe(true)
    // A sign, not a control: hidden from a screen reader, which has the row's own name.
    expect(arrow.getAttribute('aria-hidden')).toBe('true')
    expect(arrow.querySelector('svg')?.getAttribute('class')).toContain('h-3.5 w-3.5')
  })

  it('draws each destination\'s icon by the Sources block\'s rules: the house\'s own for a site it knows, the favicon for another', () => {
    inFrame(block())
    openOutbound()
    const icon = (i: number) => rows()[i].querySelector('img, svg') as Element
    // Strava and Komoot: their favicon, through the app's own route.
    expect(rows()[0].querySelector('img')?.getAttribute('src')).toContain('domain=strava.com')
    expect(rows()[2].querySelector('img')?.getAttribute('src')).toContain('domain=komoot.com')
    for (const i of [0, 2]) {
      expect(rows()[i].querySelector('img')?.className).toContain('w-5 h-5')
      expect(rows()[i].querySelector('img')?.getAttribute('alt')).toBe('')
    }
    // Instagram and YouTube: the house draws them itself, so no favicon is asked for.
    for (const i of [1, 3]) {
      const src = rows()[i].querySelector('img')?.getAttribute('src') ?? ''
      expect(src).not.toContain('/api/favicon')
      expect(icon(i)).toBeTruthy()
    }
  })

  it('draws the house globe when a favicon does not load, or is the route\'s 16 px stand-in', async () => {
    // Two sites the house has no artwork for: their only icon is their favicon.
    h.useOutboundUrls.mockReturnValue({
      data: [{ value: 'https://first.unknown-site.example/a', count: 9 }, { value: 'https://second.unknown-site.example/b', count: 4 }],
      error: undefined,
      isLoading: false,
    })
    inFrame(block({ goalCounts: [] }))
    openOutbound()
    const first = rows()[0].querySelector('img') as HTMLImageElement
    expect(first.getAttribute('src')).toContain('domain=first.unknown-site.example')
    fireEvent.error(first)
    expect(rows()[0].querySelector('img')).toBeNull()
    expect(rows()[0].querySelector('svg')).toBeTruthy()
    // The other row is untouched by the first one's failure.
    const second = rows()[1].querySelector('img') as HTMLImageElement
    expect(second).toBeTruthy()
    Object.defineProperty(second, 'naturalWidth', { value: 16 })
    fireEvent.load(second)
    // The image component hands a load on once the picture is decoded: a moment later.
    await waitFor(() => expect(rows()[1].querySelector('img')).toBeNull())
    expect(rows()[1].querySelector('svg')).toBeTruthy()
  })

  it('keeps a favicon that loaded at its real size', async () => {
    h.useOutboundUrls.mockReturnValue({ data: [{ value: 'https://first.unknown-site.example/a', count: 9 }], error: undefined, isLoading: false })
    inFrame(block({ goalCounts: [] }))
    openOutbound()
    const icon = rows()[0].querySelector('img') as HTMLImageElement
    Object.defineProperty(icon, 'naturalWidth', { value: 32 })
    fireEvent.load(icon)
    // Past the moment the load is handed on (the test above waits for the same hand-over to take the icon away).
    await act(async () => { await new Promise((done) => setTimeout(done, 30)) })
    expect(rows()[0].querySelector('img')).toBeTruthy()
  })

  it('asks for this page\'s icons before they are needed, and for no icon the house draws itself', () => {
    inFrame(block())
    openOutbound()
    const asked = (h.preload.mock.calls.at(-1)?.[0] as (string | null)[]).filter(Boolean) as string[]
    expect(asked.some((u) => u.includes('domain=strava.com'))).toBe(true)
    expect(asked.some((u) => u.includes('domain=komoot.com'))).toBe(true)
    expect(asked.some((u) => u.includes('instagram'))).toBe(false)
  })

  it('keeps the block\'s one size: seven row slots, and the frame\'s card and body', async () => {
    const { FRAME_CARD, FRAME_CARD_BODY } = await import('@/lib/dashboard/frame')
    inFrame(block())
    openOutbound()
    for (const cls of FRAME_CARD.split(' ')) expect(card().classList.contains(cls), cls).toBe(true)
    const body = card().children[1] as HTMLElement
    for (const cls of FRAME_CARD_BODY.split(' ')) expect(body.classList.contains(cls), cls).toBe(true)
    // Four rows and three empty slots of a row's height.
    expect(rows()).toHaveLength(4)
    expect(body.querySelectorAll('[aria-hidden="true"].h-9')).toHaveLength(3)
  })
})

describe('more than a page of links', () => {
  const many = Array.from({ length: 16 }, (_, i) => ({ value: `https://site-${i}.example/x`, count: 100 - i }))

  it('pages them seven at a time, and names the pager\'s pages links', () => {
    h.useOutboundUrls.mockReturnValue({ data: many, error: undefined, isLoading: false })
    inFrame(block({ goalCounts: [] }))
    openOutbound()
    expect(rows()).toHaveLength(7)
    const footer = screen.getByTestId('card-footer')
    fireEvent.click(within(footer).getByRole('button', { name: /page 3/i }))
    expect(rows().map((r) => r.querySelector('.truncate')?.textContent)).toEqual(['site-14.example/x', 'site-15.example/x'])
    // The bar still measures against the most clicked link of the whole list, not of the page.
    expect(Number(rows()[0].querySelector('[data-testid="row-bar"]')?.getAttribute('data-width'))).toBeCloseTo((86 / 100) * 75, 5)
  })
})

describe('what the footer says', () => {
  it('nothing, with no filter and no imported days', () => {
    inFrame(block())
    openOutbound()
    expect(screen.queryByTestId('outbound-footnote')).toBeNull()
  })

  it('under a page filter: nothing, because the rows follow the filter', () => {
    inFrame(block(undefined as never, { filters: 'v2:country|is|NO', outbound: { goalCounts: goalCounts as Outbound['goalCounts'] } }))
    openOutbound()
    expect(screen.queryByTestId('outbound-footnote')).toBeNull()
    // The line the tab carried while its read took no filter is gone from the block.
    expect(card().textContent).not.toMatch(/not filtered|whole-site/i)
  })

  it('with imported days in range: the rows are Pulse\'s own', () => {
    inFrame(block({ goalCounts: goalCounts as Outbound['goalCounts'], goalsImported: { included: true } as Outbound['goalsImported'] }))
    openOutbound()
    const note = screen.getByTestId('outbound-footnote')
    expect(note.textContent).toBe(OUTBOUND_NATIVE_ONLY)
    // On the footer row, on one line with its whole text in the title, so the block keeps its height.
    expect(screen.getByTestId('card-footer').contains(note)).toBe(true)
    expect(note.getAttribute('title')).toBe(note.textContent)
    // The copy rules: no dash, no curly quote.
    expect(note.textContent).not.toMatch(/[–—‘’“”]/)
  })

  it('under a filter with imported days in range: nothing, since a filtered page merges nothing imported', () => {
    inFrame(block(undefined as never, { filters: 'v2:country|is|NO', outbound: { goalCounts: goalCounts as Outbound['goalCounts'], goalsImported: { included: true } as Outbound['goalsImported'] } }))
    openOutbound()
    expect(screen.queryByTestId('outbound-footnote')).toBeNull()
  })

  it('the pages\' own imported note does not show under Outbound', () => {
    inFrame(block(undefined as never, { importedCards: { page: { included: true } } as never, outbound: { goalCounts: [] } }))
    const before = screen.getByTestId('card-footer').textContent
    openOutbound()
    expect(screen.getByTestId('card-footer').textContent).not.toBe(before === '' ? 'never' : before)
  })
})

describe('when there is nothing to list', () => {
  it('waits without a claim while the first read is on its way', () => {
    h.useOutboundUrls.mockReturnValue({ data: undefined, error: undefined, isLoading: true })
    inFrame(block())
    openOutbound()
    expect(card().querySelector('[aria-busy="true"]')).toBeTruthy()
    expect(card().textContent).not.toMatch(/No outbound clicks/)
    // Seven slots, so the block does not move when the rows land.
    expect(card().querySelectorAll('[aria-busy="true"] > div')).toHaveLength(7)
  })

  it('says the range has no outbound clicks', () => {
    h.useOutboundUrls.mockReturnValue({ data: [], error: undefined, isLoading: false })
    inFrame(block({ goalCounts: [] }))
    openOutbound()
    expect(card().textContent).toContain('No outbound clicks in this range')
    expect(card().textContent).not.toContain('Nothing matches this filter')
    expect(screen.queryByTestId('outbound-footnote')).toBeNull()
  })

  it('under a filter that leaves no click: nothing matches, with the way to clear it', () => {
    // The page's filters reach this read now, so an empty tab under one is the filter's doing, as in every other
    // block: the cards' own state, with their one action.
    h.useOutboundUrls.mockReturnValue({ data: [], error: undefined, isLoading: false })
    const clearFilters = vi.fn()
    inFrame(
      <EmptyFactsProvider value={{ filtered: true, clearFilters, neverVisited: false, canWiden: true, nobodyLive: false }}>
        {block(undefined as never, { filters: 'v2:country|is|NO', outbound: { goalCounts: [] } })}
      </EmptyFactsProvider>,
    )
    openOutbound()
    expect(card().textContent).toContain('Nothing matches this filter')
    expect(card().textContent).not.toContain('No outbound clicks in this range')
    fireEvent.click(within(card()).getByRole('button', { name: 'Clear filter' }))
    expect(clearFilters).toHaveBeenCalledTimes(1)
  })

  it('says the site has outbound links switched off, where it would say there are none', () => {
    h.useOutboundUrls.mockReturnValue({ data: [], error: undefined, isLoading: false })
    inFrame(block({ goalCounts: [], trackingOff: true }))
    openOutbound()
    expect(card().textContent).toContain('Outbound links are switched off')
    expect(card().textContent).toContain('This site does not record clicks on links to other sites.')
    expect(card().textContent).not.toContain('No outbound clicks in this range')
  })

  it('still lists the clicks recorded before the option was switched off', () => {
    inFrame(block({ goalCounts: [], trackingOff: true }))
    openOutbound()
    expect(rows()).toHaveLength(4)
    expect(card().textContent).not.toContain('Outbound links are switched off')
  })

  it('in realtime it reads the block\'s own realtime line', () => {
    h.useOutboundUrls.mockReturnValue({ data: [], error: undefined, isLoading: false })
    inFrame(block(undefined as never, { live: true, liveMinutes: 5, outbound: { goalCounts: [] } }))
    openOutbound()
    expect(card().textContent).toContain('No outbound clicks in the last 5 minutes.')
  })

  it('an error with nothing to show is an error, never "no clicks"', () => {
    h.useOutboundUrls.mockReturnValue({ data: undefined, error: new Error('boom'), isLoading: false })
    inFrame(block())
    openOutbound()
    expect(card().textContent).toContain("Couldn't load outbound links")
    expect(card().textContent).not.toContain('No outbound clicks')
  })

  it('rows outlive a failed refresh', () => {
    h.useOutboundUrls.mockReturnValue({ data: urls, error: new Error('boom'), isLoading: false })
    inFrame(block())
    openOutbound()
    expect(rows()).toHaveLength(4)
    expect(card().textContent).not.toContain("Couldn't load outbound links")
  })
})

describe('the other three tabs are as they were', () => {
  it('Pages, Entries and Exits keep their rows, their units and their footer after a visit to Outbound', () => {
    inFrame(block())
    openOutbound()
    fireEvent.click(screen.getByRole('radio', { name: 'Pages' }))
    expect(unit()).toBe('VisitorsViews')
    expect(rows().map((r) => r.querySelector('.truncate')?.textContent)).toEqual(['/page-0', '/page-1', '/page-2'])
    expect(rows()[0].tagName).toBe('DIV')
    expect(within(card()).getByRole('button', { name: 'About Pages' })).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Entries' }))
    expect(unit()).toBe('Visitors')
  })
})

describe('under the event-filters beta (R45): a press filters by the link, the arrow opens it', () => {
  it('filters the page by every stored address the row stands for, and keeps the link on its arrow', async () => {
    const { OUTBOUND_KIND } = await import('@/lib/filters')
    // Two stored addresses that read the same make one row (outboundLinkRows): its filter names both.
    h.useOutboundUrls.mockReturnValue({
      data: [{ value: 'https://www.strava.com/clubs/haldencycles', count: 443 }, { value: 'https://strava.com/clubs/haldencycles', count: 7 }],
      error: undefined,
      isLoading: false,
    })
    const onFilter = vi.fn()
    inFrame(block({ period: '7d', goalCounts: goalCounts as Outbound['goalCounts'], filterByLink: true }, { onFilter }))
    openOutbound()
    const row = rows()[0]
    expect(row.tagName).toBe('DIV')
    fireEvent.click(within(row).getByRole('button', { name: /Filter by outbound link: strava.com\/clubs\/haldencycles/ }))
    expect(onFilter).toHaveBeenCalledWith({
      dimension: OUTBOUND_KIND,
      operator: 'is',
      values: ['https://www.strava.com/clubs/haldencycles', 'https://strava.com/clubs/haldencycles'],
    })
    const arrow = within(row).getByTestId('outbound-link-arrow')
    expect(arrow.tagName).toBe('A')
    expect(arrow.getAttribute('href')).toBe('https://www.strava.com/clubs/haldencycles')
    expect(arrow.getAttribute('target')).toBe('_blank')
  })

  it('opens the link from the whole row without the beta, as before', () => {
    inFrame(block())
    openOutbound()
    expect(rows()[0].tagName).toBe('A')
  })
})
