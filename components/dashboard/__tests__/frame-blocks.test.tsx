import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import Sources from '@/components/dashboard/Sources'
import Audience from '@/components/dashboard/Locations'
import TechSpecs from '@/components/dashboard/TechSpecs'
import ContentStats from '@/components/dashboard/ContentStats'
import ContentSignals from '@/components/dashboard/ContentSignals'
import GoalStats from '@/components/dashboard/GoalStats'
import { DashboardFrameProvider } from '@/lib/dashboard/frame'
import { CAMPAIGN_VIEW_KEY, PUBLIC_CAMPAIGN_VIEW_KEY } from '@/lib/dashboard/campaignView'
import { SiteScopeProvider, SITE_PAGES, type SiteScope } from '@/lib/scope/SiteScope'

// ---------------------------------------------------------------------------
// The blocks INSIDE the new dashboard frame (beta `new-dashboard`), each beside itself outside it.
//
// A block learns it is in the frame from DashboardFrameProvider and from nothing else, so every case here renders
// the same block twice: in the provider (one size, glass, its frame-only parts) and bare (today's card, to the
// class). jsdom lays nothing out: sizes are pinned as the classes that make them and were measured on the page.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  useFullDimensionList: vi.fn(),
  useCampaignsList: vi.fn(),
  usePagePreview: vi.fn(),
  useEventPropertyKeys: vi.fn(),
  useEventPropertyValues: vi.fn(),
  getEventPropertyKeys: vi.fn(),
  getEventPropertyValues: vi.fn(),
  mapProps: null as Record<string, unknown> | null,
}))

// The Campaigns tab's menu (components/dashboard/TabMenu) enters and leaves as the date menu does. The shared
// stand-in lets a closing menu go at once, as the date picker's tests do; TabMenu.test.tsx pins the entrance itself.
vi.mock('framer-motion', () => import('@/components/settings/__tests__/framer-mock'))

vi.mock('@/lib/swr/dashboard', () => ({
  useFullDimensionList: (...a: unknown[]) => h.useFullDimensionList(...a),
  useCampaignsList: (...a: unknown[]) => h.useCampaignsList(...a),
  usePagePreview: (...a: unknown[]) => h.usePagePreview(...a),
  useEventPropertyKeys: (...a: unknown[]) => h.useEventPropertyKeys(...a),
  useEventPropertyValues: (...a: unknown[]) => h.useEventPropertyValues(...a),
}))
vi.mock('@/lib/api/stats', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/stats')>()),
  getEventPropertyKeys: (...a: unknown[]) => h.getEventPropertyKeys(...a),
  getEventPropertyValues: (...a: unknown[]) => h.getEventPropertyValues(...a),
}))
// Data behaviour, not motion: the cascade renders plain so no exit animation holds a row in jsdom.
vi.mock('@/components/dashboard/Cascade', () => ({
  CascadeGroup: ({ className, children }: { className?: string; children: React.ReactNode }) => <div className={className}>{children}</div>,
  CascadeRow: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  RowBar: () => <div data-testid="row-bar" />,
}))
// The map pulls a browser-only drawing lib: a stub that records what the block hands it.
vi.mock('@/components/dashboard/MapView', () => ({
  default: (p: Record<string, unknown>) => { h.mapProps = p; return <div data-testid="map-view" /> },
}))
// jsdom has no IntersectionObserver. The Locations block draws its map once it is in view: here it always is.
vi.stubGlobal('IntersectionObserver', class {
  constructor(private readonly callback: (entries: Array<{ isIntersecting: boolean }>) => void) {}
  observe() { this.callback([{ isIntersecting: true }]) }
  unobserve() {}
  disconnect() {}
})

const idle = { data: undefined, error: undefined, isLoading: false, mutate: vi.fn() }
const totals = { pageviews: 453, visitors: 314 }
const dateRange = { start: '2026-11-08', end: '2026-11-14' }
const inFrame = (ui: React.ReactElement) => render(<DashboardFrameProvider>{ui}</DashboardFrameProvider>)
const card = () => document.querySelector('[data-tour="dimension-card"]') as HTMLElement
const classes = (el: Element) => new Set(el.className.split(/\s+/).filter(Boolean))

const referrers = ['google.com', 'linkedin.com', 'chatgpt.com', 'bing.com', 'ddg.gg', 'x.com', 'reddit.com', 'startpage.com']
  .map((referrer, i) => ({ referrer, pageviews: 100 - i * 10, visitors: 90 - i * 10 }))
const pages = Array.from({ length: 8 }, (_, i) => ({ path: `/page-${i}`, pageviews: 100 - i, visitors: 80 - i, bounce_rate: null, avg_duration: null }))
const countries = [{ country: 'BE', pageviews: 40, visitors: 30 }, { country: 'NO', pageviews: 20, visitors: 12 }]
const browsers = [{ browser: 'Firefox', pageviews: 40, visitors: 30 }, { browser: 'Safari', pageviews: 20, visitors: 12 }]
const NAMES = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india']
const events = NAMES.map((event_name, i) => ({ event_name, count: 90 - i * 10 }))

const BLOCKS: Array<[string, () => React.ReactElement]> = [
  ['Sources', () => <Sources referrers={referrers} siteId="site-1" dateRange={dateRange} totals={totals} />],
  ['Pages', () => <ContentStats topPages={pages} entryPages={[]} exitPages={[]} domain="example.com" siteId="site-1" dateRange={dateRange} totals={totals} />],
  ['Locations', () => <Audience countries={countries} cities={[]} regions={[]} languages={[]} timezones={[]} siteId="site-1" dateRange={dateRange} totals={totals} />],
  ['Technology', () => <TechSpecs browsers={browsers} os={[]} devices={[]} screenResolutions={[]} siteId="site-1" dateRange={dateRange} totals={totals} />],
  ['Events', () => <ContentSignals goalCounts={events} siteId="site-1" dateRange={dateRange} />],
]

beforeEach(() => {
  h.useFullDimensionList.mockReset().mockReturnValue(idle)
  h.useCampaignsList.mockReset().mockReturnValue(idle)
  h.usePagePreview.mockReset().mockReturnValue({ data: null })
  h.useEventPropertyKeys.mockReset().mockReturnValue({ ...idle, data: [], available: true })
  h.useEventPropertyValues.mockReset().mockReturnValue({ ...idle, available: true })
  h.getEventPropertyKeys.mockReset().mockResolvedValue([])
  h.getEventPropertyValues.mockReset().mockResolvedValue([])
  h.mapProps = null
})

describe.each(BLOCKS)('%s: one size and glass in the frame, today\'s card outside it', (name, block) => {
  it('is 442 px tall and glass in the frame', () => {
    inFrame(block())
    const root = classes(card())
    for (const c of ['glass-block', 'h-[442px]', 'border', 'border-white/[0.08]', 'p-6', 'flex', 'flex-col', 'min-w-0']) expect(root.has(c), c).toBe(true)
    // Neither today's fill nor today's height: the block must not grow with its neighbour or with its content.
    for (const c of ['bg-card', 'h-full', 'border-border']) expect(root.has(c), c).toBe(false)
  })

  it('is today\'s card, to the class, outside it', () => {
    render(block())
    expect(card().className).toBe('bg-card rounded-none p-6 h-full flex flex-col border border-border min-w-0')
  })

  it('gives its body what the header and the footer leave, and never a height of its own, in the frame', () => {
    inFrame(block())
    // A block's body is its second child. The Events block holds two panes in one grid instead: the grid takes the
    // block's height, and each pane's body (its second child) takes what that pane's header and footer leave.
    const bodies = name === 'Events'
      ? [card().firstElementChild as Element, ...[...card().querySelectorAll('[data-events-pane]')].map((pane) => pane.children[1])]
      : [card().children[1]]
    expect(bodies.length).toBe(name === 'Events' ? 3 : 1)
    for (const body of bodies) {
      expect(classes(body).has('flex-1')).toBe(true)
      expect(classes(body).has('min-h-0')).toBe(true)
      expect(body.className).not.toContain('min-h-[270px]')
    }
  })

  it('keeps the 270 px floor of its body outside it', () => {
    render(block())
    expect(card().children[1].className).toContain('min-h-[270px]')
  })
})

describe('the footer: a block\'s note and its pager share ONE row in the frame', () => {
  it('holds the pager, in the middle, with no margin of its own', () => {
    inFrame(<Sources referrers={referrers} siteId="site-1" dateRange={dateRange} totals={totals} />)
    const footer = screen.getByTestId('card-footer')
    const pager = within(footer).getByRole('navigation', { name: 'Pages of referrers' })
    expect(classes(pager).has('mx-auto')).toBe(true)
    expect(pager.className).not.toContain('mt-3.5')
    // The row is the block's last child and a fixed 24 px under 14 px of space: what the pager took before.
    expect(card().lastElementChild).toBe(footer)
    for (const c of ['mt-3.5', 'h-6', 'shrink-0', 'flex', 'items-center']) expect(classes(footer).has(c), c).toBe(true)
  })

  it('takes no room when the block has one page and no note', () => {
    inFrame(<Sources referrers={referrers.slice(0, 3)} siteId="site-1" dateRange={dateRange} totals={totals} />)
    const footer = screen.getByTestId('card-footer')
    expect(footer.childElementCount).toBe(0)
    expect(classes(footer).has('empty:hidden')).toBe(true)
  })

  it('outside the frame there is no row: the pager keeps its own margin under the rows', () => {
    render(<Sources referrers={referrers} siteId="site-1" dateRange={dateRange} totals={totals} />)
    expect(screen.queryByTestId('card-footer')).toBeNull()
    const pager = screen.getByRole('navigation', { name: 'Pages of referrers' })
    expect(pager.className).toBe('flex items-center justify-center gap-0.5 mt-3.5')
    expect(pager.parentElement).toBe(card())
  })

  // The import holds no rows for the card's dimension while the range overlaps it (lib/dashboard/importBoundary.ts,
  // cardImportNote): the one state in which a card carries a note.
  const importedCards = { referrer: { included: false, from: '2026-01-01', through: '2026-09-14', source: 'plausible', reason: 'surface_unsupported' } }

  it('puts an imported-history note on the row with the pager, on one line with its whole text in the title', () => {
    inFrame(<Sources referrers={referrers} siteId="site-1" dateRange={dateRange} totals={totals} importedCards={importedCards} />)
    const note = screen.getByTestId('imported-card-note')
    expect(note.textContent).toMatch(/^Referrers before 15 Sep aren't in the import\./)
    const footer = screen.getByTestId('card-footer')
    expect(footer.contains(note)).toBe(true)
    // Both on the one row: the note first, taking the room, the pager after it.
    const pager = within(footer).getByRole('navigation', { name: 'Pages of referrers' })
    expect([...footer.children]).toEqual([note, pager])
    for (const c of ['truncate', 'flex-1', 'min-w-0']) expect(classes(note).has(c), c).toBe(true)
    expect(note.className).not.toContain('mt-3')
    expect(note.getAttribute('title')).toBe(note.textContent)
  })

  it('stacks the note over the pager outside the frame, as today', () => {
    render(<Sources referrers={referrers} siteId="site-1" dateRange={dateRange} totals={totals} importedCards={importedCards} />)
    const note = screen.getByTestId('imported-card-note')
    expect(note.className).toBe('mt-3 text-[11px] text-neutral-500')
    expect(note.hasAttribute('title')).toBe(false)
    expect(note.nextElementSibling).toBe(screen.getByRole('navigation', { name: 'Pages of referrers' }))
  })
})

describe('Events: the last block, across both columns', () => {
  // The block's own rulings are pinned in events-block.test.tsx; here, what it shares with the other blocks.
  const listPane = () => card().querySelector('[data-events-pane="list"]') as HTMLElement

  it('in the frame it is the events beside the picked one\'s properties: never scroll depth, whatever arrives', () => {
    inFrame(<ContentSignals goalCounts={events} siteId="site-1" dateRange={dateRange} scrollDepth={{ total_sessions: 12, buckets: [] } as never} />)
    expect(within(listPane()).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Your events', 'Automatic'])
    expect(screen.queryByRole('radio', { name: 'Scroll depth' })).toBeNull()
    expect(listPane().querySelectorAll('[data-event]').length).toBe(7)
    expect(card().querySelector('[data-events-pane="properties"]')).toBeTruthy()
    // The tour still finds the block by the one attribute.
    expect(card().getAttribute('data-tour-card')).toBe('content-signals')
  })

  it('does not read the page capture, which is the scroll tab\'s alone', () => {
    inFrame(<ContentSignals goalCounts={events} siteId="site-1" dateRange={dateRange} />)
    expect(h.usePagePreview).not.toHaveBeenCalled()
  })

  it('outside the frame it is today\'s card: two tabs, scroll depth first, the capture read for the site', () => {
    render(<ContentSignals goalCounts={events} siteId="site-1" dateRange={dateRange} />)
    expect(screen.getAllByRole('radio').map((r) => r.textContent)).toEqual(['Scroll depth', 'Events'])
    expect(screen.getAllByRole('radio')[0].getAttribute('aria-checked')).toBe('true')
    expect(screen.queryByRole('heading', { name: 'Events' })).toBeNull()
    expect(h.usePagePreview.mock.calls[0][0]).toBe('site-1')
  })

  it('says imported days are included on its footer row, beside the pager, in the frame', () => {
    inFrame(<ContentSignals goalCounts={events} siteId="site-1" dateRange={dateRange} goalsImported={{ included: true } as never} />)
    const word = screen.getByTestId('events-imported-word')
    const footer = within(listPane()).getByTestId('card-footer')
    expect([...footer.children]).toEqual([word, within(footer).getByRole('navigation', { name: 'Pages of events' })])
    for (const c of ['truncate', 'flex-1', 'min-w-0']) expect(classes(word).has(c), c).toBe(true)
  })

  const expanded = () => screen.getAllByTestId('goal-row').filter((r) => r.getAttribute('aria-expanded') === 'true').map((r) => r.textContent?.replace(/\d+$/, '').trim())
  const press = async (name: string) => {
    const row = screen.getAllByTestId('goal-row').find((r) => r.textContent?.startsWith(name)) as HTMLElement
    await act(async () => { fireEvent.click(row) })
  }

  it('today\'s card keeps every opened event open, as before', async () => {
    render(<GoalStats goalCounts={events} siteId="site-1" dateRange={dateRange} bare />)
    await press('alpha')
    await press('charlie')
    expect(expanded()).toEqual(['alpha', 'charlie'])
  })

  it('today\'s card leaves its list as it is', () => {
    render(<GoalStats goalCounts={events} siteId="site-1" dateRange={dateRange} bare />)
    const list = screen.getAllByTestId('goal-row')[0].parentElement!.parentElement as HTMLElement
    expect(list.className).toBe('space-y-2 flex-1 min-h-[270px]')
    expect(screen.queryByTestId('card-footer')).toBeNull()
  })
})

describe('Locations: the map lives inside the block', () => {
  const block = () => <Audience countries={countries} cities={[]} regions={[]} languages={[]} timezones={[]} siteId="site-1" dateRange={dateRange} totals={totals} previousVisitors={200} />
  const openMap = () => fireEvent.click(screen.getByRole('radio', { name: 'Map' }))

  const headline = () => card().querySelector('[aria-live="polite"]') as HTMLElement

  it('gives the map its final box the moment the tab is chosen, before the drawing has loaded', async () => {
    inFrame(block())
    openMap()
    // The drawing is a separate chunk (next/dynamic) and is not there on this first frame. Its box already is,
    // at the body's full height, with the headline laid over its lower left corner: nothing has to move when the
    // drawing arrives, which is what made the map jump before.
    const box = headline().parentElement as HTMLElement
    expect(box.className).toBe('relative h-full')
    for (const c of ['absolute', 'bottom-0', 'left-0', 'pointer-events-none']) expect(classes(headline()).has(c), c).toBe(true)
    expect(headline().className).not.toContain('mb-2')
    // The map tab has no pager, so the footer row takes no room and the drawing gets it.
    expect(screen.getByTestId('card-footer').childElementCount).toBe(0)

    // The drawing arrives into the same box, told to fill it.
    const map = await screen.findByTestId('map-view')
    expect(map.parentElement).toBe(box)
    expect(headline().parentElement).toBe(box)
    expect(h.mapProps?.fill).toBe(true)
  })

  it('keeps the headline above a map as tall as its width makes it, outside the frame', async () => {
    render(block())
    openMap()
    const map = await screen.findByTestId('map-view')
    expect(h.mapProps?.fill).toBe(false)
    const box = map.parentElement as HTMLElement
    expect(box.className).toBe('flex h-full flex-col')
    expect(headline().className).toBe('mb-2 min-h-[3.25rem]')
  })
})

describe('Sources: the Campaigns tab is its own menu in the frame', () => {
  const campaignRows = [
    { source: 'google', medium: 'cpc', campaign: 'launch', term: '', content: '', visitors: 157, pageviews: 200, bounce_rate: null, avg_duration: null },
    { source: 'linkedin', medium: 'social', campaign: 'launch', term: '', content: '', visitors: 31, pageviews: 40, bounce_rate: null, avg_duration: null },
  ]
  const block = () => <Sources referrers={referrers} siteId="site-1" dateRange={dateRange} totals={totals} />
  const tab = () => screen.getAllByRole('radio')[2]
  /** The tab's two parts: a pointer's press lands on one of them. A press on the tab itself is the keyboard's. */
  const name = () => tab().querySelector('[data-tab-menu-name]') as HTMLElement
  const caret = () => tab().querySelector('[data-tab-menu-caret]') as HTMLElement
  /** What is on screen on the tab: the words kept for a screen reader left out. */
  const tabReads = () => {
    const seen = tab().cloneNode(true) as HTMLElement
    seen.querySelectorAll('.sr-only').forEach((n) => n.remove())
    return seen.textContent
  }
  const rowNames = () => [...card().children[1].querySelectorAll('.interactive-row')].map((r) => r.textContent?.replace(/[\d%]+$/, '').trim())
  const view = (label: string) => within(screen.getByRole('menu')).getByRole('menuitemradio', { name: label })

  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    h.useCampaignsList.mockReturnValue({ data: campaignRows, error: undefined, isLoading: false, mutate: vi.fn() })
  })

  it('reads the open view on every state of the tab, never "Campaigns"', () => {
    inFrame(block())
    // Another tab is open: the third one is already the view, not the name of its group.
    expect(screen.getAllByRole('radio')[0].getAttribute('aria-checked')).toBe('true')
    expect(tabReads()).toBe('Source')
    // A screen reader still hears whose view it is.
    expect(tab().textContent).toBe('Campaigns: Source')
    fireEvent.click(name())
    expect(tab().getAttribute('aria-checked')).toBe('true')
    expect(tabReads()).toBe('Source')
    expect(tab().textContent).toBe('Campaigns: Source, press again to choose another view')
    // No second control in the header: the Select is gone, and no menu is open yet.
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('a press on the name chooses the tab and opens nothing, however often it is pressed', () => {
    inFrame(block())
    fireEvent.click(name())
    expect(rowNames()).toEqual(['Google', 'LinkedIn'])
    fireEvent.click(name())
    fireEvent.click(name())
    expect(tab().getAttribute('aria-checked')).toBe('true')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('the caret opens the five views in ONE press from another tab, choosing the tab on the way', () => {
    inFrame(block())
    expect(tab().getAttribute('aria-checked')).toBe('false')
    fireEvent.click(caret())
    expect(tab().getAttribute('aria-checked')).toBe('true')
    expect(rowNames()).toEqual(['Google', 'LinkedIn'])
    const menu = screen.getByRole('menu', { name: 'Campaign dimension' })
    const items = within(menu).getAllByRole('menuitemradio')
    expect(items.map((i) => i.textContent)).toEqual(['Source', 'Medium', 'Campaign', 'Term', 'Content'])
    expect(items.map((i) => i.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false', 'false'])
    expect(document.activeElement).toBe(items[0])
    // The caret is turned while the list is open.
    expect(caret().querySelector('svg')?.getAttribute('class')).toContain('rotate-180')
    // Glass, and drawn outside the block (a portal), where there is a page behind it to blur.
    expect(classes(menu).has('glass-panel')).toBe(true)
    expect(card().contains(menu)).toBe(false)
  })

  it('on the open tab the caret opens the list and closes it again', () => {
    inFrame(block())
    fireEvent.click(name())
    fireEvent.click(caret())
    expect(screen.getByRole('menu')).toBeTruthy()
    fireEvent.click(caret())
    expect(screen.queryByRole('menu')).toBeNull()
    expect(tab().getAttribute('aria-checked')).toBe('true')
    expect(caret().querySelector('svg')?.getAttribute('class')).not.toContain('rotate-180')
  })

  it('the keyboard reaches the list too: a press on the chosen tab itself opens it and closes it', () => {
    // Enter and Space on the tab arrive as a click on the button, on neither of its two parts.
    inFrame(block())
    fireEvent.click(tab())
    expect(tab().getAttribute('aria-checked')).toBe('true')
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(tab())
    expect(screen.getByRole('menu', { name: 'Campaign dimension' })).toBeTruthy()
    fireEvent.click(tab())
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('switches the view from the menu, closes it and names the new view on the tab', () => {
    inFrame(block())
    fireEvent.click(caret())
    expect(rowNames()).toEqual(['Google', 'LinkedIn'])
    fireEvent.click(view('Medium'))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(tabReads()).toBe('Medium')
    expect(rowNames()).toEqual(['cpc', 'social'])
    expect(document.activeElement).toBe(tab())
  })

  it('keeps the view\'s name while another tab is open: it is the tab until another view is picked', () => {
    inFrame(block())
    fireEvent.click(caret())
    fireEvent.click(view('Term'))
    fireEvent.click(screen.getAllByRole('radio')[0])
    expect(tab().getAttribute('aria-checked')).toBe('false')
    expect(tabReads()).toBe('Term')
    fireEvent.click(screen.getAllByRole('radio')[1])
    expect(tabReads()).toBe('Term')
    fireEvent.click(name())
    expect(tabReads()).toBe('Term')
    // Until another view is picked.
    fireEvent.click(caret())
    fireEvent.click(view('Content'))
    fireEvent.click(screen.getAllByRole('radio')[0])
    expect(tabReads()).toBe('Content')
  })

  describe('the view last picked is the one the tab is, as the date range is remembered', () => {
    const demo: SiteScope = { siteId: 'site-1', mode: 'public', basePath: '/demo', pages: SITE_PAGES, demo: true, fidelity: 'full' }
    const share: SiteScope = { siteId: 'site-1', mode: 'public', basePath: '/share/site-1', pages: ['dashboard'], demo: false, fidelity: 'scoped' }
    const pick = (label: string) => {
      fireEvent.click(caret())
      fireEvent.click(view(label))
    }

    it('a member\'s pick is kept in this browser, and the next dashboard shows it on the tab before the tab is opened', () => {
      const first = inFrame(block())
      pick('Medium')
      expect(window.localStorage.getItem(CAMPAIGN_VIEW_KEY)).toBe('medium')
      first.unmount()
      inFrame(block())
      // Referrers is open, nothing was pressed: the tab is already the remembered view.
      expect(screen.getAllByRole('radio')[0].getAttribute('aria-checked')).toBe('true')
      expect(tabReads()).toBe('Medium')
      fireEvent.click(name())
      expect(tabReads()).toBe('Medium')
      expect(rowNames()).toEqual(['cpc', 'social'])
    })

    it('reads the memory in the layout phase, so no frame can show "Source" first, whatever update mounted the block', () => {
      // What the tab shows cannot tell an early read from a late one, here or on a hard load in a browser.
      // Measured 15-11-2026 in Chromium and WebKit: a block mounted by an urgent update (its data arriving) has
      // its passive effects run before the task ends, so "Source" is replaced before any frame either way. The
      // two differ when the block mounts inside an update that is not urgent (a move between pages with the data
      // already held): there a passive effect runs after the paint, and the tab would show "Source" for a frame.
      // So this pins WHEN the read happens. A beacon drawn before the block notes each phase as React reaches it:
      // its layout effect runs before the block's, and its passive effect before the block's passive effects.
      window.localStorage.setItem(CAMPAIGN_VIEW_KEY, 'term')
      let phase = 'render'
      function Beacon() {
        React.useLayoutEffect(() => { phase = 'layout' }, [])
        React.useEffect(() => { phase = 'passive' }, [])
        return null
      }
      const readIn: string[] = []
      const real = Storage.prototype.getItem
      const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key: string) {
        if (key === CAMPAIGN_VIEW_KEY) readIn.push(phase)
        return real.call(this, key)
      })
      try {
        inFrame(<><Beacon />{block()}</>)
      } finally {
        getItem.mockRestore()
      }
      expect(readIn).toEqual(['layout'])
      expect(tabReads()).toBe('Term')
    })

    it('opening the list writes nothing: only a pick does', () => {
      inFrame(block())
      fireEvent.click(caret())
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
      fireEvent.click(name())
      expect(window.localStorage.getItem(CAMPAIGN_VIEW_KEY)).toBeNull()
    })

    it('a memory that is not one of the five views is no memory', () => {
      window.localStorage.setItem(CAMPAIGN_VIEW_KEY, 'keyword')
      inFrame(block())
      expect(tabReads()).toBe('Source')
      fireEvent.click(name())
      expect(tabReads()).toBe('Source')
    })

    it('the demo keeps its pick until the tab closes, under its own key, and never touches a member\'s', () => {
      window.localStorage.setItem(CAMPAIGN_VIEW_KEY, 'content')
      const first = render(<SiteScopeProvider scope={demo}><DashboardFrameProvider>{block()}</DashboardFrameProvider></SiteScopeProvider>)
      // The member's own memory is not the demo's.
      expect(tabReads()).toBe('Source')
      pick('Campaign')
      expect(window.sessionStorage.getItem(PUBLIC_CAMPAIGN_VIEW_KEY)).toBe('campaign')
      expect(window.localStorage.getItem(CAMPAIGN_VIEW_KEY)).toBe('content')
      first.unmount()
      render(<SiteScopeProvider scope={demo}><DashboardFrameProvider>{block()}</DashboardFrameProvider></SiteScopeProvider>)
      expect(tabReads()).toBe('Campaign')
    })

    it('a share link remembers nothing and reads nothing', () => {
      window.localStorage.setItem(CAMPAIGN_VIEW_KEY, 'content')
      window.sessionStorage.setItem(PUBLIC_CAMPAIGN_VIEW_KEY, 'term')
      render(<SiteScopeProvider scope={share}><DashboardFrameProvider>{block()}</DashboardFrameProvider></SiteScopeProvider>)
      expect(tabReads()).toBe('Source')
      pick('Medium')
      expect(tabReads()).toBe('Medium')
      expect(window.localStorage.getItem(CAMPAIGN_VIEW_KEY)).toBe('content')
      expect(window.sessionStorage.getItem(PUBLIC_CAMPAIGN_VIEW_KEY)).toBe('term')
    })

    it('outside the frame nothing is read and nothing is written: today\'s Select is as it was', () => {
      window.localStorage.setItem(CAMPAIGN_VIEW_KEY, 'medium')
      render(block())
      fireEvent.click(tab())
      // Today's page opens on Source whatever the frame remembers.
      expect(rowNames()).toEqual(['Google', 'LinkedIn'])
      expect(window.localStorage.getItem(CAMPAIGN_VIEW_KEY)).toBe('medium')
    })
  })

  it('closes on Escape, on a press of the name, and when another tab is chosen', () => {
    inFrame(block())
    fireEvent.click(caret())
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(tab())

    // The name is not the caret: a press on it is a press outside the list, and its click opens nothing.
    fireEvent.click(caret())
    expect(screen.getByRole('menu')).toBeTruthy()
    fireEvent.pointerDown(name())
    fireEvent.click(name())
    expect(screen.queryByRole('menu')).toBeNull()
    expect(tab().getAttribute('aria-checked')).toBe('true')

    fireEvent.click(caret())
    expect(screen.getByRole('menu')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('radio')[0])
    expect(screen.queryByRole('menu')).toBeNull()
    // Back on Campaigns by its name it is the tab again, not an open menu.
    fireEvent.click(name())
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('outside the frame the tab is a plain tab and the views are behind the Select, as today', () => {
    render(block())
    // No parts, no caret, and its own name before it is chosen and after.
    expect(tab().textContent).toBe('Campaigns')
    expect(tab().querySelector('[data-tab-menu-name], [data-tab-menu-caret], svg')).toBeNull()
    fireEvent.click(tab())
    expect(tab().textContent).toBe('Campaigns')
    expect(screen.getByRole('combobox', { name: 'Campaign dimension' })).toBeTruthy()
    fireEvent.click(tab())
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
