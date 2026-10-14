import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

// Pins the 404-vs-error split on the funnel DETAIL route. The load-bearing
// case is the first one: the error object is a PLAIN OBJECT carrying `status`,
// not an ApiError instance — which is exactly what a chunk-split bundle hands
// this page (two copies of the ApiError class; `instanceof` across them is
// false for a real 404, measured on staging when the LIST page shipped the
// same bug). A revert to `instanceof ApiError` fails that test and only that
// test, so the guard holds the fix, not just the happy path.

const mockFunnelDetail = vi.fn()
const deleteFunnel = vi.fn()
const routerPush = vi.fn()

vi.mock('@/lib/swr/dashboard', () => ({
  useSite: () => ({ data: undefined }),
  // null = the data window is unknown, which greys nothing (lib/view/view.ts).
  useDataWindow: () => null,
  useFunnelDetail: () => mockFunnelDetail(),
  useFunnelStats: () => ({ data: undefined, error: undefined, isValidating: false, mutate: vi.fn() }),
}))

vi.mock('@/lib/api/funnels', () => ({
  deleteFunnel: (...a: unknown[]) => deleteFunnel(...a),
  updateFunnel: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'site-1', funnelId: 'funnel-1' }),
  usePathname: () => '/sites/site-1/funnels/funnel-1',
  useRouter: () => ({ replace: vi.fn(), push: (...a: unknown[]) => routerPush(...a) }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/lib/auth/permissions', () => ({ useCan: () => true }))

vi.mock('@/lib/hooks/useUrlDateRange', () => ({
  useUrlDateRange: () => ({
    period: '30',
    dateRange: { start: '2026-07-27', end: '2026-08-26' },
    periodReady: true,
    setPeriod: vi.fn(),
    shiftPeriod: vi.fn(),
    // The page spreads this into <DateRangePicker {...picker} /> — the real
    // component, so the mock carries the whole props object it needs.
    picker: {
      label: 'Last 30 days',
      suffix: null,
      tick: '30',
      rows: [],
      footnote: null,
      onPick: vi.fn(),
      onCustom: vi.fn(),
      onShift: vi.fn(),
      shiftBackDisabled: false,
      shiftForwardDisabled: true,
      calendar: { max: '2026-08-26', maxDays: 366, range: { start: '2026-07-27', end: '2026-08-26' } },
      now: new Date('2026-08-26T12:00:00Z'),
    },
  }),
}))

vi.mock('@/lib/hooks/useFilterSuggestions', () => ({
  useFilterSuggestions: () => async () => [],
}))
vi.mock('@/components/dashboard/filter/useFilterBuilder', () => ({
  useFilterBuilder: () => ({}),
}))

vi.mock('@/components/skeletons', () => ({
  FunnelDetailSkeleton: () => <div data-testid="skeleton" />,
}))

vi.mock('@/components/dashboard/MetricInfoTip', () => ({ TermInfoTip: () => null }))
vi.mock('@/components/dashboard/FilterButton', () => ({ default: () => null }))
vi.mock('@/components/dashboard/FilterPills', () => ({ default: () => null }))
vi.mock('@/components/dashboard/filter/FilterBuilder', () => ({ default: () => null }))
vi.mock('@/components/ui/DateRangePicker', () => ({ default: () => null }))

vi.mock('framer-motion', () => ({
  motion: { div: ({ className }: { className?: string }) => <div className={className} /> },
}))

const toastError = vi.fn()
vi.mock('@ciphera-net/facet', () => ({
  toast: { success: () => {}, error: (...a: unknown[]) => toastError(...a) },
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  // lib/utils re-exports cn from facet; EmptyState/ErrorCard break without it.
  cn: (...parts: unknown[]) => parts.filter(Boolean).join(' '),
  getAuthErrorMessage: (e: Error) => e?.message ?? '',
}))

// The page calls useDeferredRemoval() unconditionally (PUL-28), which throws
// outside an UndoProvider; the hold dialog and the Undo window are
// facet-hold's own suite, not this file's.
vi.mock('@ciphera-net/facet-hold', async () =>
  (await import('@/lib/hold/__tests__/facetHoldStandIn')).facetHoldStandIn())

import FunnelDetailPage from '../page'
import { ApiError } from '@/lib/api/client'
import { deferred, resetDeferred, commitLast, undoLast } from '@/lib/hold/__tests__/facetHoldStandIn'

const errorState = (error: unknown) => ({
  data: undefined,
  error,
  isLoading: false,
  mutate: vi.fn(),
})

beforeEach(() => {
  mockFunnelDetail.mockReset()
  deleteFunnel.mockReset().mockResolvedValue(undefined)
  routerPush.mockReset()
  toastError.mockReset()
  resetDeferred()
})

describe('funnel detail 404-vs-error split', () => {
  it('renders "Funnel not found" for a 404 that is NOT an ApiError instance (chunk-split shape)', () => {
    mockFunnelDetail.mockReturnValue(errorState({ status: 404 }))
    const { getByText, queryByText } = render(<FunnelDetailPage />)
    expect(getByText('Funnel not found')).toBeTruthy()
    expect(queryByText("Couldn't load this funnel")).toBeNull()
  })

  it('renders "Funnel not found" for a real ApiError 404 too', () => {
    mockFunnelDetail.mockReturnValue(errorState(new ApiError('not found', 404)))
    const { getByText } = render(<FunnelDetailPage />)
    expect(getByText('Funnel not found')).toBeTruthy()
  })

  it('renders the retryable ErrorCard for a non-404 failure, never "not found"', () => {
    mockFunnelDetail.mockReturnValue(errorState(new ApiError('boom', 500)))
    const { getByText, queryByText } = render(<FunnelDetailPage />)
    expect(getByText("Couldn't load this funnel")).toBeTruthy()
    expect(queryByText('Funnel not found')).toBeNull()
  })

  it('renders the ErrorCard for a status-less error (no fabricated 404)', () => {
    mockFunnelDetail.mockReturnValue(errorState(new Error('network down')))
    const { getByText, queryByText } = render(<FunnelDetailPage />)
    expect(getByText("Couldn't load this funnel")).toBeTruthy()
    expect(queryByText('Funnel not found')).toBeNull()
  })
})

const FUNNEL = { id: 'funnel-1', site_id: 'site-1', name: 'Signup flow', description: null, steps: [], created_at: '', updated_at: '' }
const funnelState = (over: Record<string, unknown> = {}) => ({ data: FUNNEL, error: undefined, isLoading: false, mutate: vi.fn(), ...over })

describe('funnel detail: delete through a hold dialog, navigating at once (PUL-28)', () => {
  it('navigates to the list at once, with nothing sent until the Undo window runs out', async () => {
    mockFunnelDetail.mockReturnValue(funnelState())
    render(<FunnelDetailPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete "Signup flow"?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hold to delete' }))

    expect(routerPush).toHaveBeenCalledWith('/sites/site-1/funnels')
    expect(deleteFunnel).not.toHaveBeenCalled()
    expect(deferred[0]!.message).toBe('"Signup flow" deleted')

    await commitLast()
    expect(deleteFunnel).toHaveBeenCalledWith('site-1', 'funnel-1', { keepalive: false })
  })

  it('passes keepalive through to the request on a commit sent as the page closes', async () => {
    mockFunnelDetail.mockReturnValue(funnelState())
    render(<FunnelDetailPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hold to delete' }))
    await commitLast({ keepalive: true })
    expect(deleteFunnel).toHaveBeenCalledWith('site-1', 'funnel-1', { keepalive: true })
  })

  it('Undo sends nothing', async () => {
    mockFunnelDetail.mockReturnValue(funnelState())
    render(<FunnelDetailPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hold to delete' }))
    undoLast()
    expect(deleteFunnel).not.toHaveBeenCalled()
  })

  it('a rejected delete says so', async () => {
    deleteFunnel.mockRejectedValueOnce(new Error())
    mockFunnelDetail.mockReturnValue(funnelState())
    render(<FunnelDetailPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hold to delete' }))
    await commitLast()
    expect(toastError).toHaveBeenCalledWith('Couldn\'t delete "Signup flow". Try again.')
  })
})
