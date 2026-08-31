import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ContentStats from '@/components/dashboard/ContentStats'
import type { TopPage } from '@/lib/api/stats'

// The hooks are the seam: these tests pin WHAT the card asks for (kind,
// limit, filters — the F14 threading) and what it renders from the answer
// (true denominators — F9; error states — F17).
const useFullDimensionList = vi.fn()
vi.mock('@/lib/swr/dashboard', () => ({
  useFullDimensionList: (...args: unknown[]) => useFullDimensionList(...args),
}))

// The virtualizer needs real layout measurement; render every row instead.
vi.mock('@/components/dashboard/VirtualList', () => ({
  default: ({ items, renderItem }: { items: unknown[]; renderItem: (item: never, index: number) => React.ReactNode }) => (
    <div>{items.map((item, index) => renderItem(item as never, index))}</div>
  ),
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

  it('keeps the denominator note in the MODAL only (header note removed, owner call)', () => {
    render(<ContentStats {...baseProps} totals={totals} />)
    expect(screen.queryByText(/Shares are of all 314 visitors/)).toBeNull()
    fireEvent.click(screen.getByLabelText('View all pages'))
    expect(screen.getByText(/Shares are of all 314 visitors/)).toBeTruthy()
  })

  it('renders NO percentages without totals — never a fabricated denominator', () => {
    render(<ContentStats {...baseProps} />)
    expect(screen.queryByText(/^\d+%$/)).toBeNull()
  })
})

describe('ContentStats modal (F14 + F17)', () => {
  it('threads the active filters and the tab kind into the full-list fetch', () => {
    render(<ContentStats {...baseProps} totals={totals} filters="country:is:DE" />)
    fireEvent.click(screen.getByLabelText('View all pages'))
    expect(useFullDimensionList).toHaveBeenLastCalledWith(
      'pages', 'site-1', '2026-07-20', '2026-08-18', 100, 'country:is:DE',
    )
  })

  it('keeps the true denominator when the modal search narrows the rows', () => {
    useFullDimensionList.mockImplementation((kind: unknown) =>
      kind ? { ...idle, data: topPages } : idle)
    render(<ContentStats {...baseProps} totals={totals} />)
    fireEvent.click(screen.getByLabelText('View all pages'))
    fireEvent.change(screen.getByPlaceholderText('Search pages...'), { target: { value: '/blog' } })
    // /blog alone remains visible in the modal; its share must stay
    // 64/314 = 20%, not 64/64 = 100% of the narrowed list. (The card behind
    // the modal shows the same 20%, so match all.)
    expect(screen.getAllByText('20%').length).toBeGreaterThan(0)
    expect(screen.queryByText('100%')).toBeNull()
  })

  it('shows an error with retry when the full-list fetch fails', () => {
    const mutate = vi.fn()
    useFullDimensionList.mockImplementation((kind: unknown) =>
      kind ? { data: undefined, error: new Error('boom'), isLoading: false, mutate } : idle)
    render(<ContentStats {...baseProps} totals={totals} />)
    fireEvent.click(screen.getByLabelText('View all pages'))
    expect(screen.getByText(/Couldn.t load the full list/)).toBeTruthy()
    fireEvent.click(screen.getByText('Retry'))
    expect(mutate).toHaveBeenCalled()
  })

  it('hides the view-all affordance when memberFeatures is false (share surface)', () => {
    render(<ContentStats {...baseProps} totals={totals} memberFeatures={false} />)
    expect(screen.queryByLabelText('View all pages')).toBeNull()
  })

  it('has no Engagement tab on any surface — the feature left 01-09-2026', () => {
    render(<ContentStats {...baseProps} totals={totals} />)
    expect(screen.queryByRole('tab', { name: 'Engagement' })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Pages' })).toBeTruthy()
  })
})

