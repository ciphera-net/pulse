import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ContentStats from '@/components/dashboard/ContentStats'
import type { TopPage } from '@/lib/api/stats'

// The hooks are the seam: these tests pin WHAT the card asks for (kind,
// limit, filters — the F14 threading) and what it renders from the answer
// (true denominators — F9; pagination since the blocks round, 01-09-2026).
const useFullDimensionList = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({
  useFullDimensionList: (...args: unknown[]) => useFullDimensionList(...args),
}))

// Pin data behaviour, not motion: the cascade renders plain in tests so
// AnimatePresence exit timing can never make a page flip flaky in jsdom.
vi.mock('@/components/dashboard/Cascade', () => ({
  CascadeGroup: ({ className, children }: { className?: string; children: React.ReactNode }) => (
    <div className={className}>{children}</div>
  ),
  CascadeRow: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  RowBar: ({ width }: { width: number }) => <div data-testid="row-bar" style={{ width: `${width}%` }} />,
}))

const idle = { data: undefined, error: undefined, isLoading: false, mutate: vi.fn() }

const page = (path: string, pageviews: number): TopPage => ({ path, pageviews, visitors: pageviews, bounce_rate: null, avg_duration: null })

// The audit's F9 example: 453 total pageviews, top row 200. Share-of-top-N
// said 52%; the truth — and what must render — is 44%.
const topPages = [
  page('/', 200), page('/blog', 64), page('/products/pulse', 41), page('/about', 23),
  page('/products/id', 14), page('/pricing', 12), page('/products/relay', 10), page('/contact', 8),
]
const totals = { pageviews: 453, visitors: 314 }

const baseProps = {
  topPages,
  entryPages: [] as TopPage[],
  exitPages: [] as TopPage[],
  domain: 'ciphera.net',
  siteId: 'site-1',
  dateRange: { start: '2026-07-20', end: '2026-08-18' },
}

beforeEach(() => {
  useFullDimensionList.mockReset().mockReturnValue(idle)
})

describe('ContentStats denominators (F9)', () => {
  it('divides each row by the true range total, not the sum of visible rows', () => {
    render(<ContentStats {...baseProps} totals={totals} />)
    // Rows share on VISITORS since the O3 decouple: 200/314 = 64% —
    // share-of-top-N would say 200/372 = 54% here.
    expect(screen.getByText('64%')).toBeTruthy()
    expect(screen.queryByText('54%')).toBeNull()
  })

  it('renders the denominator note nowhere — it retired with the view-all modal', () => {
    render(<ContentStats {...baseProps} totals={totals} />)
    expect(screen.queryByText(/Shares are of all/)).toBeNull()
  })

  it('renders NO percentages without totals — never a fabricated denominator', () => {
    render(<ContentStats {...baseProps} />)
    expect(screen.queryByText(/^\d+%$/)).toBeNull()
  })
})

describe('ContentStats pagination (blocks round, 01-09-2026)', () => {
  it('arms the full-list fetch with kind, limit and filters as soon as the tab overflows', () => {
    render(<ContentStats {...baseProps} totals={totals} filters="country:is:DE" />)
    // 8 rows > LIMIT 7 — no interaction needed; the card fetches ahead so
    // page flips are instant.
    expect(useFullDimensionList).toHaveBeenLastCalledWith(
      'pages', 'site-1', '2026-07-20', '2026-08-18', 100, 'country:is:DE',
    )
  })

  it('pages the FULL list once it arrives: page 2 shows rows the fan-out never carried', () => {
    const fullList = [
      ...topPages,
      page('/docs', 7), page('/careers', 6), page('/legal', 5), page('/status', 4),
    ]
    useFullDimensionList.mockImplementation((kind: unknown) =>
      kind ? { ...idle, data: fullList } : idle)
    render(<ContentStats {...baseProps} totals={totals} />)
    // 12 rows → 2 pages. Page 1 shows the head, not the tail.
    expect(screen.getByText('/')).toBeTruthy()
    expect(screen.queryByText('/status')).toBeNull()
    fireEvent.click(screen.getByLabelText('Next page'))
    expect(screen.getByText('/status')).toBeTruthy()
    expect(screen.queryByText('/blog')).toBeNull()
    // Position is stated and the back chevron re-arms.
    expect(screen.getByLabelText('Page 2').getAttribute('aria-current')).toBe('page')
    fireEvent.click(screen.getByLabelText('Previous page'))
    expect(screen.getByText('/blog')).toBeTruthy()
  })

  it('falls back to paging the fan-out rows when the full-list fetch fails', () => {
    useFullDimensionList.mockImplementation((kind: unknown) =>
      kind ? { data: undefined, error: new Error('boom'), isLoading: false, mutate: vi.fn() } : idle)
    render(<ContentStats {...baseProps} totals={totals} />)
    // 8 fan-out rows still paginate: nothing shown is wrong, the tail is
    // simply capped at what the payload carried.
    fireEvent.click(screen.getByLabelText('Next page'))
    expect(screen.getByText('/contact')).toBeTruthy()
  })

  it('ignores leftover full-list rows when the list no longer overflows', () => {
    // The frozen-blocks bug (01-09-2026): rows retained from another range
    // must never outrank a fan-out that no longer overflows.
    useFullDimensionList.mockImplementation(() => ({ ...idle, data: topPages }))
    render(<ContentStats {...baseProps} topPages={topPages.slice(0, 4)} totals={totals} />)
    expect(screen.getByText('/')).toBeTruthy()
    expect(screen.queryByText('/contact')).toBeNull()
    expect(screen.queryByLabelText('Next page')).toBeNull()
  })

  it('renders no pager at all for a single page', () => {
    render(<ContentStats {...baseProps} topPages={topPages.slice(0, 5)} totals={totals} />)
    expect(screen.queryByLabelText('Next page')).toBeNull()
  })

  it('never arms the full-list fetch on the share surface, but still pages its payload', () => {
    render(<ContentStats {...baseProps} totals={totals} memberFeatures={false} />)
    expect(useFullDimensionList).toHaveBeenLastCalledWith(
      null, 'site-1', '2026-07-20', '2026-08-18', 100, undefined,
    )
    fireEvent.click(screen.getByLabelText('Next page'))
    expect(screen.getByText('/contact')).toBeTruthy()
  })

  it('has no Engagement tab on any surface — the feature left 01-09-2026', () => {
    render(<ContentStats {...baseProps} totals={totals} />)
    expect(screen.queryByRole('tab', { name: 'Engagement' })).toBeNull()
    expect(screen.getByRole('radio', { name: 'Pages' })).toBeTruthy()
  })
})
