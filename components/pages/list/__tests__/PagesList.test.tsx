import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { PageTableRow } from '@/lib/api/stats'

// ---------------------------------------------------------------------------
// The Pages page's list (components/pages/list/PagesList.tsx). What these pin:
//   the list      every page at once, busiest first, and a count that never claims more than was read;
//   the change    a row's views against the period before, by the opened page's own rule, so the two agree, and
//                 no mark where the comparison means nothing (never a "0%" or a "+300%" off three views);
//   the order     every column both ways, a row without a figure last in both;
//   the address   the search, the order, the opened page, its tab and a phone's column start from the address and
//                 are written back to it;
//   the first     the list's first page is open when the list arrives, unless the address names a page or says
//                 the reader closed them all; it is chosen once and then stays with its row;
//   one day       the rows' bars are the day's hours, up to the hour a day still being counted has reached;
//   a phone       one number column, the one picked.
// ---------------------------------------------------------------------------

let search = ''
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(search) }))
// The bars and the chart are their own drawings; here they say what they were handed.
vi.mock('../DayBars', () => ({
  default: ({ values, hours }: { values: number[]; hours?: string[] }) => <span data-testid="bars" data-hours={hours ? hours.length : ''}>{values.join(',')}</span>,
}))
vi.mock('../PageTrend', () => ({
  PREV_INK: 'grey',
  default: ({ data, drawPrev }: { data: { views: number | null; prev: number | null }[]; drawPrev: boolean }) => <div data-testid="trend" data-prev={String(drawPrev)}>{data.map((d) => d.views).join(',')}</div>,
}))
vi.mock('@/components/dashboard/MetricInfoTip', () => ({ TermInfoTip: ({ term }: { term: string }) => <span data-testid={`tip-${term}`} /> }))
// The page flip keeps the outgoing rows on screen until they have left; a test reads the list the moment it changes.
vi.mock('@/components/dashboard/Cascade', () => ({
  CascadeGroup: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>,
  CascadeRow: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

import PagesList, { LIST_PARAMS } from '../PagesList'

const page = (path: string, pageviews: number, over: Partial<PageTableRow> = {}): PageTableRow => ({
  path,
  pageviews,
  visitors: Math.round(pageviews * 0.9),
  entries: Math.round(pageviews / 2),
  exits: Math.round(pageviews / 4),
  exit_rate: 25,
  avg_time_on_page: 40,
  entry_bounce_rate: 50,
  avg_scroll_depth: 60,
  trend: [1, 2, 3],
  delta: null,
  ...over,
})

const ROWS = [page('/', 1000), page('/pricing', 400), page('/blog/a', 120), page('/blog/b', 30), page('/new', 8)]
// The period before: / fell from 1250, /pricing rose from 320, /blog/a is unchanged, /blog/b had 3 views (too few
// to compare), /new had none.
const PREV = [page('/', 1250), page('/pricing', 320), page('/blog/a', 120), page('/blog/b', 3)]

const base = { rows: ROWS, prevRows: PREV, limit: 500, start: '2026-11-01', prevStart: '2026-10-29', live: false, hourly: false }
const paths = () => Array.from(document.querySelectorAll('[data-page-line]')).map((r) => r.getAttribute('data-page-line'))
const line = (path: string) => document.querySelector(`[data-page-line="${path}"]`) as HTMLElement
const change = (path: string) => line(path).querySelector('[data-line-change]') as HTMLElement
const head = (label: string) => screen.getByRole('button', { name: new RegExp(`^Sort by ${label},`, 'i') })
/** The name over the rows' bars. Read by its mark: the list's first page is open, and its panel has words of its own. */
const barsHead = () => document.querySelector('[data-bars-head]') as HTMLElement | null

beforeEach(() => {
  search = ''
  window.history.replaceState({}, '', '/sites/s/pages')
})

describe('the list', () => {
  it('draws every page at once, the busiest first, and counts them', () => {
    render(<PagesList {...base} />)
    expect(paths()).toEqual(['/', '/pricing', '/blog/a', '/blog/b', '/new'])
    expect(document.querySelector('[data-pages-count]')).toHaveTextContent('5 pages')
    expect(screen.queryByText(/Show \d+ more/)).toBeNull()
  })

  it('counts one page as a page', () => {
    render(<PagesList {...base} rows={[ROWS[0]]} />)
    expect(document.querySelector('[data-pages-count]')).toHaveTextContent(/^1 page$/)
  })

  it('at the read\'s limit says there are more, never the limit as the count', () => {
    render(<PagesList {...base} limit={5} />)
    expect(document.querySelector('[data-pages-count]')).toHaveTextContent('5+ pages')
  })

  it('finds pages by a part of their address, and says so when none holds it', () => {
    render(<PagesList {...base} />)
    fireEvent.change(screen.getByLabelText('Search pages'), { target: { value: 'BLOG' } })
    expect(paths()).toEqual(['/blog/a', '/blog/b'])
    fireEvent.change(screen.getByLabelText('Search pages'), { target: { value: 'nothing-here' } })
    expect(paths()).toEqual([])
    expect(screen.getByText('No page matches')).toBeInTheDocument()
  })

  it('has no cross in the search field', () => {
    render(<PagesList {...base} />)
    fireEvent.change(screen.getByLabelText('Search pages'), { target: { value: 'blog' } })
    expect(screen.queryByLabelText(/clear/i)).toBeNull()
  })
})

describe('the change', () => {
  it('is a row\'s views against the period before', () => {
    render(<PagesList {...base} />)
    expect(change('/')).toHaveTextContent('↓ 20%')
    expect(change('/pricing')).toHaveTextContent('↑ 25%')
  })

  it('writes an unchanged page as 0% in grey, never as a fall of 0%', () => {
    render(<PagesList {...base} />)
    expect(change('/blog/a')).toHaveTextContent(/^0%$/)
    expect(change('/blog/a').textContent).not.toMatch(/[↑↓]/)
  })

  it('is a dash where the comparison means nothing: under ten views before, or none', () => {
    render(<PagesList {...base} />)
    expect(change('/blog/b')).toHaveTextContent('—')
    expect(change('/new')).toHaveTextContent('—')
  })

  it('is a dash on every row while the period before is not read', () => {
    render(<PagesList {...base} prevRows={undefined} />)
    for (const p of paths()) expect(change(p!)).toHaveTextContent('—')
  })

  it('agrees with the opened page\'s own figure', () => {
    // The list's first page, /, is open as the list arrives.
    render(<PagesList {...base} />)
    const views = document.querySelector('[data-page-open="/"] [data-page-measures] > div') as HTMLElement
    expect(views).toHaveTextContent('Views')
    expect(views).toHaveTextContent('↓ 20%')
    expect(views).toHaveTextContent('1,250 in the period before')
  })
})

describe('the order', () => {
  it('sorts by the change both ways, a row without one last in both', () => {
    render(<PagesList {...base} />)
    fireEvent.click(head('change'))
    expect(paths()).toEqual(['/pricing', '/blog/a', '/', '/blog/b', '/new'])
    fireEvent.click(head('change'))
    expect(paths()).toEqual(['/', '/blog/a', '/pricing', '/blog/b', '/new'])
  })

  it('keeps a page with no bounce rate last, low to high as well', () => {
    const rows = [page('/a', 300, { entry_bounce_rate: 70 }), page('/b', 200, { entry_bounce_rate: null }), page('/c', 100, { entry_bounce_rate: 10 })]
    render(<PagesList {...base} rows={rows} prevRows={undefined} />)
    fireEvent.click(head('bounce'))
    expect(paths()).toEqual(['/a', '/c', '/b'])
    fireEvent.click(head('bounce'))
    expect(paths()).toEqual(['/c', '/a', '/b'])
  })
})

describe('the opened page', () => {
  it('opens in place under its row with its line, six measures, two tabs and two ways out', () => {
    render(<PagesList {...base} domain="https://example.com/" renderScroll={(p) => <div data-testid="scroll">{p}</div>} dashboardHref={(p) => `/sites/s?filters=page${p}`} />)
    fireEvent.click(within(line('/pricing')).getByRole('button'))
    const opened = document.querySelector('[data-page-open="/pricing"]') as HTMLElement
    expect(opened).not.toBeNull()
    expect(within(opened).getByTestId('trend')).toHaveTextContent('1,2,3')
    expect(opened.querySelectorAll('[data-page-measures] > div')).toHaveLength(6)
    expect(within(opened).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Trend', 'Scroll depth'])
    expect(within(opened).queryByText('Before and after')).toBeNull()
    const links = Array.from(opened.querySelectorAll('[data-page-actions] a')).map((a) => a.getAttribute('href'))
    expect(links).toEqual(['/sites/s?filters=page/pricing', 'https://example.com/pricing'])
  })

  it('shows one page at a time, on its trend', () => {
    render(<PagesList {...base} renderScroll={(p) => <div data-testid="scroll">{p}</div>} />)
    // / is open as the list arrives.
    fireEvent.click(screen.getByRole('radio', { name: 'Scroll depth' }))
    expect(screen.getByTestId('scroll')).toHaveTextContent('/')
    fireEvent.click(within(line('/pricing')).getByRole('button'))
    expect(document.querySelectorAll('[data-page-open]')).toHaveLength(1)
    expect(document.querySelector('[data-page-open="/pricing"]')).not.toBeNull()
    expect(screen.queryByTestId('scroll')).toBeNull()
    // A second press on the open row closes it.
    fireEvent.click(within(line('/pricing')).getByRole('button'))
    expect(document.querySelector('[data-page-open]')).toBeNull()
  })

  it('names the period before in the legend only where a line is drawn for it', () => {
    render(<PagesList {...base} />)
    fireEvent.click(within(line('/new')).getByRole('button'))
    expect(screen.getByTestId('trend')).toHaveAttribute('data-prev', 'false')
    expect(screen.queryByText('Previous period')).toBeNull()
    fireEvent.click(within(line('/')).getByRole('button'))
    expect(screen.getByTestId('trend')).toHaveAttribute('data-prev', 'true')
    expect(screen.getByText('Previous period')).toBeInTheDocument()
  })
})

describe('the first page', () => {
  const opened = () => Array.from(document.querySelectorAll('[data-page-open]')).map((o) => o.getAttribute('data-page-open'))

  it('is open when the list arrives, on its trend, and the address says nothing', () => {
    render(<PagesList {...base} />)
    expect(opened()).toEqual(['/'])
    expect(within(line('/')).getByRole('button')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('trend')).toBeInTheDocument()
    for (const word of LIST_PARAMS) expect(new URLSearchParams(window.location.search).has(word), word).toBe(false)
  })

  it('is the first of the list as the address orders and searches it', () => {
    search = 'q=blog&sort=pageviews.asc'
    render(<PagesList {...base} />)
    expect(paths()).toEqual(['/blog/b', '/blog/a'])
    expect(opened()).toEqual(['/blog/b'])
  })

  it('gives way to a page the address names', () => {
    search = 'show=/pricing'
    render(<PagesList {...base} />)
    expect(opened()).toEqual(['/pricing'])
  })

  it('stays closed where the address says the reader closed every page', () => {
    search = 'show=none'
    render(<PagesList {...base} />)
    expect(opened()).toEqual([])
    expect(new URLSearchParams(window.location.search).get('show')).toBe('none')
  })

  it('is chosen once: it stays with its row through a sort and a search, and the address then names it', () => {
    render(<PagesList {...base} />)
    fireEvent.click(head('views'))
    expect(paths()).toEqual(['/new', '/blog/b', '/blog/a', '/pricing', '/'])
    expect(opened()).toEqual(['/'])
    // No longer the list's first page: a reload must open / again, so the address names it.
    expect(new URLSearchParams(window.location.search).get('show')).toBe('/')
    fireEvent.click(head('views'))
    expect(new URLSearchParams(window.location.search).has('show')).toBe(false)
    fireEvent.change(screen.getByLabelText('Search pages'), { target: { value: 'pricing' } })
    expect(opened()).toEqual([])
    fireEvent.change(screen.getByLabelText('Search pages'), { target: { value: '' } })
    expect(opened()).toEqual(['/'])
  })

  it('once closed by the reader stays closed, and the address says so', () => {
    render(<PagesList {...base} />)
    fireEvent.click(within(line('/')).getByRole('button'))
    expect(opened()).toEqual([])
    expect(new URLSearchParams(window.location.search).get('show')).toBe('none')
    // Sorting or searching does not open a page again behind the reader's back.
    fireEvent.click(head('visitors'))
    fireEvent.change(screen.getByLabelText('Search pages'), { target: { value: 'blog' } })
    expect(opened()).toEqual([])
  })

  it('waits for the list: nothing is opened on an empty one, and the first page that arrives is', () => {
    const { rerender } = render(<PagesList {...base} rows={[]} prevRows={undefined} />)
    expect(opened()).toEqual([])
    expect(new URLSearchParams(window.location.search).has('show')).toBe(false)
    rerender(<PagesList {...base} />)
    expect(opened()).toEqual(['/'])
  })

  it('keeps the tab the address names for it', () => {
    search = 'tab=scroll'
    render(<PagesList {...base} renderScroll={(p) => <div data-testid="scroll">{p}</div>} />)
    expect(screen.getByTestId('scroll')).toHaveTextContent('/')
    expect(new URLSearchParams(window.location.search).get('tab')).toBe('scroll')
    expect(new URLSearchParams(window.location.search).has('show')).toBe(false)
  })

  // The page mounts its list before the rows are there (and again once they are): the tab must outlive the wait.
  it('keeps that tab while the list has no row yet, so the first page that arrives opens on it', () => {
    search = 'tab=scroll'
    window.history.replaceState({}, '', '/sites/s/pages?tab=scroll')
    const scroll = (p: string) => <div data-testid="scroll">{p}</div>
    const { rerender } = render(<PagesList {...base} rows={[]} prevRows={undefined} renderScroll={scroll} />)
    expect(opened()).toEqual([])
    expect(new URLSearchParams(window.location.search).get('tab')).toBe('scroll')
    rerender(<PagesList {...base} renderScroll={scroll} />)
    expect(screen.getByTestId('scroll')).toHaveTextContent('/')
    expect(new URLSearchParams(window.location.search).get('tab')).toBe('scroll')
    expect(new URLSearchParams(window.location.search).has('show')).toBe(false)
  })

  it('opens on that tab in a list mounted again once its rows are there', () => {
    search = 'tab=scroll'
    window.history.replaceState({}, '', '/sites/s/pages?tab=scroll')
    const scroll = (p: string) => <div data-testid="scroll">{p}</div>
    const waiting = render(<PagesList {...base} rows={[]} prevRows={undefined} renderScroll={scroll} />)
    waiting.unmount()
    // The second list starts from the address the first one left behind.
    search = window.location.search.slice(1)
    render(<PagesList {...base} renderScroll={scroll} />)
    expect(screen.getByTestId('scroll')).toHaveTextContent('/')
  })

  it('names no tab once the reader closed the page', () => {
    search = 'tab=scroll'
    render(<PagesList {...base} renderScroll={(p) => <div data-testid="scroll">{p}</div>} />)
    fireEvent.click(within(line('/')).getByRole('button'))
    const at = new URLSearchParams(window.location.search)
    expect(at.get('show')).toBe('none')
    expect(at.has('tab')).toBe(false)
  })
})

describe('what an opened page says of the period before', () => {
  const lines = () => Array.from(document.querySelectorAll('[data-measure-context]')).map((l) => l.textContent)
  const changes = () => Array.from(document.querySelectorAll('[data-line-change]')).map((c) => c.textContent)

  // 18-11-2026: "— in the period before" read as a gap, not a sentence. The server sends null where a figure
  // had nothing to stand on: time and scroll when no view reported them, bounce when no visit started on the page.
  it('says in words why a figure had no value then, and never puts a dash in a sentence', () => {
    const quiet = [page('/', 1250, { avg_time_on_page: null, avg_scroll_depth: null, entry_bounce_rate: null }), ...PREV.slice(1)]
    render(<PagesList {...base} prevRows={quiet} />)
    expect(lines()).toEqual([
      '1,250 in the period before',
      '1,125 in the period before',
      'not measured in the period before',
      'not measured in the period before',
      'no visit started here in the period before',
      '25% in the period before',
    ])
    for (const l of lines()) expect(l).not.toContain('—')
  })

  it('says the page had no views then, where it had none', () => {
    search = 'show=/new'
    render(<PagesList {...base} />)
    expect(new Set(lines())).toEqual(new Set(['no views in the period before']))
  })

  it('says there is no period before only where there is none', () => {
    render(<PagesList {...base} prevRows={undefined} />)
    expect(new Set(lines())).toEqual(new Set(['no period before']))
    expect(new Set(changes())).toEqual(new Set(['—']))
  })

  it('says the period before did not load when its read failed, never that there is none', () => {
    render(<PagesList {...base} prevRows={undefined} before="failed" />)
    expect(new Set(lines())).toEqual(new Set(['the period before did not load']))
  })

  it('shows the loading mark while the period before loads: in its lines and in the Change column, no dash', () => {
    render(<PagesList {...base} prevRows={undefined} before="loading" />)
    const contexts = Array.from(document.querySelectorAll('[data-measure-context]'))
    expect(contexts).toHaveLength(6)
    for (const c of contexts) {
      expect(c.textContent).toBe('')
      expect(c.getAttribute('data-before')).toBe('loading')
      expect(c.children).toHaveLength(1)
    }
    for (const c of Array.from(document.querySelectorAll('[data-line-change]'))) {
      expect(c.textContent).toBe('')
      expect(c.children).toHaveLength(1)
    }
  })

  it('takes the rows in hand over a word that says otherwise', () => {
    render(<PagesList {...base} before="loading" />)
    expect(lines()[0]).toBe('1,250 in the period before')
    expect(change('/')).toHaveTextContent('↓ 20%')
  })
})

describe('the address', () => {
  it('starts the list as the address says', () => {
    search = 'q=blog&sort=change.asc&show=/blog/a&tab=scroll&col=exit_rate'
    render(<PagesList {...base} renderScroll={(p) => <div data-testid="scroll">{p}</div>} />)
    expect(screen.getByLabelText('Search pages')).toHaveValue('blog')
    expect(paths()).toEqual(['/blog/a', '/blog/b'])
    expect(head('change')).toHaveAttribute('data-dir', 'asc')
    expect(screen.getByTestId('scroll')).toHaveTextContent('/blog/a')
  })

  it('takes a word it does not know as its first state', () => {
    search = 'sort=nonsense.up&tab=moves&col=nothing'
    render(<PagesList {...base} />)
    expect(paths()).toEqual(['/', '/pricing', '/blog/a', '/blog/b', '/new'])
    expect(head('views')).toHaveAttribute('data-dir', 'desc')
  })

  it('writes the search, the order, the opened page and its tab back, and keeps what is not its own', () => {
    window.history.replaceState({}, '', '/sites/s/pages?period=7&filters=v2%3Acountry%7Cis%7CNO')
    render(<PagesList {...base} renderScroll={() => <div />} />)
    fireEvent.change(screen.getByLabelText('Search pages'), { target: { value: 'blog' } })
    fireEvent.click(head('exit rate'))
    fireEvent.click(within(line('/blog/b')).getByRole('button'))
    fireEvent.click(screen.getByRole('radio', { name: 'Scroll depth' }))
    const at = new URLSearchParams(window.location.search)
    expect(at.get('q')).toBe('blog')
    expect(at.get('sort')).toBe('exit_rate.desc')
    expect(at.get('show')).toBe('/blog/b')
    expect(at.get('tab')).toBe('scroll')
    expect(at.get('period')).toBe('7')
    expect(at.get('filters')).toBe('v2:country|is|NO')
  })

  it('leaves nothing behind once the list is back at its first state', () => {
    search = 'q=blog&sort=change.asc&show=/blog/a'
    window.history.replaceState({}, '', `/sites/s/pages?${search}`)
    render(<PagesList {...base} />)
    fireEvent.change(screen.getByLabelText('Search pages'), { target: { value: '' } })
    fireEvent.click(head('views'))
    // The first state has the list's first page open.
    fireEvent.click(within(line('/')).getByRole('button'))
    const at = new URLSearchParams(window.location.search)
    for (const word of LIST_PARAMS) expect(at.has(word), word).toBe(false)
  })
})

describe('a range of one day', () => {
  it('draws each row\'s hours, and heads the column by the hour', () => {
    const hours = Array.from({ length: 24 }, (_, h) => h)
    render(<PagesList {...base} rows={[page('/', 276, { hours, trend: [276] })]} prevRows={undefined} hourly />)
    expect(barsHead()).toHaveTextContent('Views an hour')
    expect(screen.getByTestId('bars')).toHaveTextContent(hours.join(','))
    expect(screen.getByTestId('bars')).toHaveAttribute('data-hours', '24')
  })

  it('draws a day still being counted up to the hour it has reached', () => {
    const hours = Array.from({ length: 24 }, (_, h) => (h <= 9 ? 5 : 0))
    render(<PagesList {...base} rows={[page('/', 50, { hours, trend: [50] })]} prevRows={undefined} hourly live nowHour={9} />)
    expect(screen.getByTestId('bars')).toHaveTextContent('5,5,5,5,5,5,5,5,5,5')
    expect(screen.getByTestId('bars')).toHaveAttribute('data-hours', '10')
  })

  it('leaves the bars out where one day has no hours to draw: one bar says nothing', () => {
    render(<PagesList {...base} rows={[page('/', 50, { trend: [50] })]} prevRows={undefined} />)
    expect(screen.queryByTestId('bars')).toBeNull()
    expect(barsHead()).toBeNull()
  })

  it('leaves the bars out, and heads nothing by the hour, where the day came back without its hours', () => {
    // The server answers a day without hours when it cannot read it by the hour: the list asked, and has none.
    render(<PagesList {...base} rows={[page('/', 50, { trend: [50] }), page('/pricing', 20, { trend: [20] })]} prevRows={undefined} hourly />)
    expect(screen.queryByTestId('bars')).toBeNull()
    expect(barsHead()).toBeNull()
    // The rows and their numbers are still there.
    expect(line('/')).toBeInTheDocument()
    expect(line('/pricing')).toBeInTheDocument()
  })

  it('draws days over a longer range', () => {
    render(<PagesList {...base} />)
    expect(barsHead()).toHaveTextContent('Views a day')
    expect(screen.getAllByTestId('bars')[0]).toHaveTextContent('1,2,3')
  })
})

describe('the room the list has', () => {
  const cell = (path: string, text: string) => within(line(path)).getByText(text)

  it('shows the views alone in the narrowest list, the other columns as the LIST widens', () => {
    render(<PagesList {...base} rows={[page('/', 1000)]} prevRows={undefined} />)
    expect(head('views').className).toContain('inline-flex')
    expect(head('views').className).not.toContain('hidden')
    expect(head('bounce').className).toContain('hidden cq-[700px]:inline-flex')
    expect(cell('/', '50%').className).toContain('hidden cq-[700px]:inline-flex')
    // The list's own block is the container those rules ask.
    expect(document.querySelector('[data-pages-list]')!.className).toContain('[container-type:inline-size]')
  })

  it('shows the picked column from the narrowest list, and the views only where there is room again', () => {
    search = 'col=entry_bounce_rate'
    render(<PagesList {...base} rows={[page('/', 1000)]} prevRows={undefined} />)
    expect(head('bounce').className).toContain('inline-flex cq-[380px]:hidden cq-[700px]:inline-flex')
    expect(cell('/', '50%').className).toContain('inline-flex cq-[380px]:hidden cq-[700px]:inline-flex')
    expect(head('views').className).toContain('hidden cq-[380px]:inline-flex')
  })

  // The steps are arithmetic on what a row holds. A column added or widened without moving its step fails here.
  it('leaves an address 180 px or more at every step, by the widths of what the step shows', () => {
    render(<PagesList {...base} />)
    const width = (cls: string) => { const m = /(?:^|\s)w-(?:\[(\d+)px\]|(\d+))(?=\s|$)/.exec(cls); return m ? (m[1] ? Number(m[1]) : Number(m[2]) * 4) : 0 }
    /** The list width from which a part is shown: 0 for one that is never hidden. */
    const since = (cls: string) => (/(?:^|\s)hidden(?=\s|$)/.test(cls) ? Number(/cq-\[(\d+)px\]:(?:inline-flex|block)/.exec(cls)?.[1] ?? Infinity) : 0)
    const columns = ['views', 'change', 'visitors', 'bounce', 'time on page', 'exit rate', 'scroll'].map((label) => head(label).className).map((cls) => ({ width: width(cls), since: since(cls) }))
    const bars = { width: width(barsHead()!.className), since: since(barsHead()!.className) }
    expect(columns.map((c) => c.width)).toEqual([56, 56, 56, 56, 84, 64, 48])
    expect(bars.width).toBe(168)
    const steps = [...new Set([...columns.map((c) => c.since), bars.since])].filter((at) => at > 0).sort((x, y) => x - y)
    expect(steps).toEqual([380, 550, 700, 880])
    for (const step of steps) {
      const shown = columns.filter((c) => c.since <= step)
      // The numbers with the 12 px between them and the 16 px before them, and the bars with their 16 px.
      const drawn = shown.reduce((n, c) => n + c.width, 0) + 12 * (shown.length - 1) + 16 + (bars.since <= step ? bars.width + 16 : 0)
      expect(step - drawn, `the address's room in a list of ${step} px`).toBeGreaterThanOrEqual(180)
    }
  })

  it('draws a measure\'s change for both rooms a cell can have: at the name\'s row end, and beside the figure in the narrowest list', () => {
    render(<PagesList {...base} />)
    const views = document.querySelector('[data-page-measure]') as HTMLElement
    const atRowEnd = views.querySelector('[data-measure-change]') as HTMLElement
    const besideFigure = views.querySelector('[data-measure-figure]')!.nextElementSibling as HTMLElement
    expect(atRowEnd).toHaveTextContent('↓ 20%')
    expect(atRowEnd.className).toContain('hidden shrink-0 cq-[380px]:inline-flex')
    expect(besideFigure).toHaveTextContent('↓ 20%')
    expect(besideFigure.className).toContain('cq-[380px]:hidden')
    // Its line of context is never cut: it may take a second line.
    expect(views.querySelector('[data-measure-context]')).toHaveTextContent('1,250 in the period before')
    expect(views.querySelector('[data-measure-context]')!.className).not.toContain('truncate')
  })

  it('sets an opened page\'s measures beside its chart only where the list has 800 px', () => {
    render(<PagesList {...base} />)
    expect(document.querySelector('[data-page-open]')!.className).toContain('cq-[800px]:grid-cols-[minmax(0,1fr)_340px]')
  })
})

// The page lays itself out by the room IT has: the app's sidebar, open or closed, changes that room by about 190 px,
// and a window breakpoint cannot see it (18-11-2026: at a 1024 px window with the sidebar open the list drew the
// columns of a 1024 px page in 655 px). So none of its three drawings may ask the window.
describe('the window is never asked', () => {
  it.each(['PagesList.tsx', 'PagesStrip.tsx', 'ScrollWho.tsx'])('%s holds no window breakpoint', async (file) => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const source = readFileSync(join(process.cwd(), 'components/pages/list', file), 'utf8')
    // Classes only: comments may name a breakpoint to say why there is none.
    const code = source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
    expect(code.match(/(?<![\w-])(?:max-)?(?:sm|md|lg|xl|2xl):[\w[]+/g) ?? []).toEqual([])
  })
})
