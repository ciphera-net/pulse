import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import React from 'react'
import { ApiError } from '@/lib/api/client'

// The share cookie is the ONLY grant since the ?password= fallback was
// removed, so its 1-hour expiry is the normal failure mode of a protected
// share left open. The page must re-prompt — not keep painting hour-old
// numbers behind a live-looking indicator.

const getPublicDashboard = vi.fn()
const getPublicRealtime = vi.fn()
vi.mock('@/lib/api/stats', () => ({
  getPublicDashboard: (...a: unknown[]) => getPublicDashboard(...a),
  getPublicRealtime: (...a: unknown[]) => getPublicRealtime(...a),
  authenticatePublicDashboard: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'site-1' }),
  useRouter: () => ({ push: vi.fn() }),
}))

// Heavy dashboard children — covered by their own tests; markers keep this
// test about the page's own auth-state machine.
vi.mock('@/components/dashboard/Chart', () => ({ default: () => <div data-testid="chart" /> }))
vi.mock('@/components/dashboard/ContentStats', () => ({ default: () => null }))
vi.mock('@/components/dashboard/TopReferrers', () => ({ default: () => null }))
vi.mock('@/components/dashboard/Locations', () => ({ default: () => null }))
vi.mock('@/components/dashboard/TechSpecs', () => ({ default: () => null }))
vi.mock('@/components/dashboard/ExportModal', () => ({ default: () => null }))
vi.mock('@/components/ui/DateRangePicker', () => ({ default: () => null }))
vi.mock('@/components/sites/SiteFavicon', () => ({ SiteFavicon: () => null }))
vi.mock('@/components/skeletons', () => ({
  DashboardSkeleton: () => <div data-testid="skeleton" />,
  useMinimumLoading: (v: boolean) => v,
  useSkeletonFade: () => '',
}))

import SharePage from '@/app/share/[id]/page'

const dashboardPayload = {
  site: { id: 'site-1', name: 'Acme', domain: 'acme.com' },
  stats: { pageviews: 1234, visitors: 567, bounce_rate: 40, avg_duration: 30, avg_scroll_depth: 50, avg_visible_duration: 20 },
  realtime_visitors: 3,
  daily_stats: [],
  top_pages: [], entry_pages: [], exit_pages: [], top_referrers: [],
  countries: [], cities: [], regions: [], languages: [], timezones: [],
  browsers: [], os: [], devices: [], screen_resolutions: [],
}

beforeEach(() => {
  vi.useFakeTimers()
  getPublicRealtime.mockResolvedValue({ visitors: 3 })
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('protected share whose cookie expires mid-session', () => {
  it('re-prompts for the password instead of painting stale data', async () => {
    getPublicDashboard
      .mockResolvedValueOnce(dashboardPayload)
      .mockRejectedValue(new ApiError('unauthorized', 401, { is_protected: true }))

    render(<SharePage />)
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })

    // The dashboard rendered from the first (cookie-valid) load.
    expect(screen.getByTestId('chart')).toBeTruthy()
    expect(screen.queryByText('Protected Dashboard')).toBeNull()

    // 30s later the silent refresh hits the expired cookie.
    await act(async () => { await vi.advanceTimersByTimeAsync(31_000) })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(getPublicDashboard.mock.calls.length).toBeGreaterThanOrEqual(2)

    // The password form wins; the stale dashboard is gone.
    expect(screen.getByText('Protected Dashboard')).toBeTruthy()
    expect(screen.queryByTestId('chart')).toBeNull()
  })
})
