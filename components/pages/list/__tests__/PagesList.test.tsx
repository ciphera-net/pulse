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
    render(<PagesList {...base} />)
    fireEvent.click(within(line('/')).getByRole('button'))
    const views = document.querySelector('[data-page-measures] > div') as HTMLElement
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
    expect(document.querySelector('[data-page-open]')).toBeNull()
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
    fireEvent.click(within(line('/')).getByRole('button'))
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
    fireEvent.click(within(line('/blog/a')).getByRole('button'))
    const at = new URLSearchParams(window.location.search)
    for (const word of LIST_PARAMS) expect(at.has(word), word).toBe(false)
  })
})

describe('a range of one day', () => {
  it('draws each row\'s hours, and heads the column by the hour', () => {
    const hours = Array.from({ length: 24 }, (_, h) => h)
    render(<PagesList {...base} rows={[page('/', 276, { hours, trend: [276] })]} prevRows={undefined} hourly />)
    expect(screen.getByText('Views an hour')).toBeInTheDocument()
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
    expect(screen.queryByText(/Views an? /)).toBeNull()
  })

  it('draws days over a longer range', () => {
    render(<PagesList {...base} />)
    expect(screen.getByText('Views a day')).toBeInTheDocument()
    expect(screen.getAllByTestId('bars')[0]).toHaveTextContent('1,2,3')
  })
})

describe('a phone', () => {
  const cell = (path: string, text: string) => within(line(path)).getByText(text)

  it('shows the views alone at first, the other columns as the page widens', () => {
    render(<PagesList {...base} rows={[page('/', 1000)]} prevRows={undefined} />)
    expect(head('views').className).toContain('inline-flex')
    expect(head('views').className).not.toContain('hidden')
    expect(head('bounce').className).toContain('hidden lg:inline-flex')
    expect(cell('/', '50%').className).toContain('hidden lg:inline-flex')
  })

  it('shows the picked column from the narrowest page, and the views only where there is room again', () => {
    search = 'col=entry_bounce_rate'
    render(<PagesList {...base} rows={[page('/', 1000)]} prevRows={undefined} />)
    expect(head('bounce').className).toContain('inline-flex sm:hidden lg:inline-flex')
    expect(cell('/', '50%').className).toContain('inline-flex sm:hidden lg:inline-flex')
    expect(head('views').className).toContain('hidden sm:inline-flex')
  })
})
