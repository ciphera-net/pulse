import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

// Pins the 404-vs-error split on the funnel DETAIL route. The load-bearing
// case is the first one: the error object is a PLAIN OBJECT carrying `status`,
// not an ApiError instance — which is exactly what a chunk-split bundle hands
// this page (two copies of the ApiError class; `instanceof` across them is
// false for a real 404, measured on staging when the LIST page shipped the
// same bug). A revert to `instanceof ApiError` fails that test and only that
// test, so the guard holds the fix, not just the happy path.

const mockFunnelDetail = vi.fn()

vi.mock('@/lib/swr/dashboard', () => ({
  useSite: () => ({ data: undefined }),
  useFunnelDetail: () => mockFunnelDetail(),
  useFunnelStats: () => ({ data: undefined, error: undefined, isValidating: false, mutate: vi.fn() }),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'site-1', funnelId: 'funnel-1' }),
  usePathname: () => '/sites/site-1/funnels/funnel-1',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/lib/auth/permissions', () => ({ useCan: () => true }))

vi.mock('@/lib/hooks/useUrlDateRange', () => ({
  useUrlDateRange: () => ({
    period: '30d',
    dateRange: { start: '2026-07-27', end: '2026-08-26' },
    periodReady: true,
    setPeriod: vi.fn(),
    shiftPeriod: vi.fn(),
    pickerProps: {},
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

vi.mock('framer-motion', () => ({
  motion: { div: ({ className }: { className?: string }) => <div className={className} /> },
}))

vi.mock('@ciphera-net/facet', () => ({
  toast: { success: () => {}, error: () => {} },
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  // lib/utils re-exports cn from facet; EmptyState/ErrorCard break without it.
  cn: (...parts: unknown[]) => parts.filter(Boolean).join(' '),
}))

import FunnelDetailPage from '../page'
import { ApiError } from '@/lib/api/client'

const errorState = (error: unknown) => ({
  data: undefined,
  error,
  isLoading: false,
  mutate: vi.fn(),
})

beforeEach(() => {
  mockFunnelDetail.mockReset()
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
