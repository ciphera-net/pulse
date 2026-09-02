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
// Partial mock via importOriginal: the share page now composes Campaigns,
// whose SWR module references the full fetcher family at module scope — a
// closed mock object goes stale on every such addition and fails at import
// time, not in an assertion. The real exports are inert here (the heavy
// dashboard children are mocked below); only the three the page itself calls
// are overridden.
vi.mock('@/lib/api/stats', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/stats')>()),
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
vi.mock('@/components/dashboard/CommandDeck', () => ({ default: () => <div data-testid="deck" /> }))
vi.mock('@/components/dashboard/Campaigns', () => ({ default: () => null }))
vi.mock('@/components/dashboard/ContentSignals', () => ({ default: () => null }))
vi.mock('@/components/dashboard/SectionHeader', () => ({ default: () => null }))
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

// 🔴 Facet must be mocked here, and this file was the ONLY page test in the
// repo that did not mock it (34 siblings do).
//
// Unmocked, the 401 branch below mounts the REAL Captcha, whose mount effect
// fires a live fetch at the deliberately-unreachable host in vitest.setup.ts.
// That request can settle AFTER vitest tears this file's jsdom down — teardown
// deletes `window` from the global — so the continuation throws
// `ReferenceError: window is not defined` attributed to no test at all. It
// fails the WHOLE step while every test passes, which reads as a broken build
// rather than a flake. Seen once on pipeline 987; green on 986/988/989 and
// 1021/1021 locally, because `test.invalid` resolves in ~20ms here and only a
// slower CI resolver loses the race.
//
// Facet 0.11.1 also aborts that request on unmount, so the leak is closed at
// the source too — but a page test should not be making a network call for a
// component it is not exercising.
vi.mock('@ciphera-net/facet', () => ({
  Captcha: ({ onVerify }: any) => (
    <button data-testid="captcha" onClick={() => onVerify?.('', '', 'test-token')}>
      captcha
    </button>
  ),
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  LoadingOverlay: () => <div data-testid="loading-overlay" />,
  toast: { success: vi.fn(), error: vi.fn() },
  getAuthErrorMessage: () => 'error',
  DownloadIcon: () => <span />,
  ZapIcon: () => <span />,
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
    expect(screen.getByTestId('deck')).toBeTruthy()
    expect(screen.queryByText('Protected Dashboard')).toBeNull()

    // 30s later the silent refresh hits the expired cookie.
    await act(async () => { await vi.advanceTimersByTimeAsync(31_000) })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(getPublicDashboard.mock.calls.length).toBeGreaterThanOrEqual(2)

    // The password form wins; the stale dashboard is gone.
    expect(screen.getByText('Protected Dashboard')).toBeTruthy()
    expect(screen.queryByTestId('deck')).toBeNull()
  })
})
