import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

// PULSE-173 (F3): the bundled dashboard response — owner AND shared — now
// carries `language_groups` alongside the unchanged `languages` field. This
// pins two things about the SHARE surface specifically:
//
//   1. When `language_groups` is present, Audience (Locations.tsx) receives
//      it and renders the grouped view — and still receives the (now always
//      empty, on a floored payload) `languages` array without choking.
//   2. When `language_groups` is ABSENT (an older backend, deploy skew),
//      Audience falls back to the per-locale `languages` list — the same
//      fallback the owner dashboard gets.
//
// And the structural guarantee the share surface depends on: `memberFeatures`
// is hard-wired to `false` here, which is what keeps every full-list /
// "view all" fetch — including the new `languages-grouped` kind — from ever
// arming on a page with no session (see Locations.tsx `wantsFullList`).
//
// Locations is mocked with a prop-capturing spy rather than the real
// component (covered by its own tests in dimension-cards.test.tsx) — this
// file only needs to prove PublicDashboard WIRES the right props to it.

const getPublicDashboard = vi.fn()
const getPublicRealtime = vi.fn()

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

vi.mock('@/components/dashboard/CommandDeck', () => ({ default: () => <div data-testid="deck" /> }))
vi.mock('@/components/dashboard/ContentSignals', () => ({ default: () => null }))
vi.mock('@/components/dashboard/SectionHeader', () => ({ default: () => null }))
vi.mock('@/components/dashboard/ContentStats', () => ({ default: () => null }))
vi.mock('@/components/dashboard/Sources', () => ({ default: () => null }))
vi.mock('@/components/dashboard/TechSpecs', () => ({ default: () => null }))
vi.mock('@/components/sites/SiteFavicon', () => ({ SiteFavicon: () => null }))
vi.mock('@/components/skeletons', () => ({
  DashboardSkeleton: () => <div data-testid="skeleton" />,
  useMinimumLoading: (v: boolean) => v,
  useSkeletonFade: () => '',
}))

const audienceSpy = vi.fn()
vi.mock('@/components/dashboard/Locations', () => ({
  default: (props: Record<string, unknown>) => {
    audienceSpy(props)
    return <div data-testid="audience" />
  },
}))

vi.mock('@ciphera-net/facet', () => ({
  Captcha: () => null,
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => <button {...props}>{children}</button>,
  LoadingOverlay: () => <div data-testid="loading-overlay" />,
  toast: { success: vi.fn(), error: vi.fn() },
  getAuthErrorMessage: () => 'error',
  cn: (...c: unknown[]) => c.filter(Boolean).join(' '),
  buttonVariants: () => '',
  ZapIcon: () => <span />,
}))

import PublicDashboard from '@/components/share/PublicDashboard'

const BASE_PAYLOAD = {
  site: { id: 'site-1', name: 'Acme', domain: 'acme.com', timezone: 'UTC' },
  stats: { pageviews: 1234, visitors: 567, bounce_rate: 40, avg_duration: 30, avg_scroll_depth: 50, avg_visible_duration: 20 },
  realtime_visitors: 4,
  daily_stats: [],
  top_pages: [], entry_pages: [], exit_pages: [], top_referrers: [],
  countries: [], cities: [], regions: [], timezones: [],
  browsers: [], os: [], devices: [], screen_resolutions: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  getPublicRealtime.mockResolvedValue({ visitors: 4 })
})

describe('PublicDashboard — Languages wiring (PULSE-173)', () => {
  it('passes language_groups through, and the (floored, empty) languages list alongside it', async () => {
    const groups = [
      { language: 'en', pageviews: 283, visitors: 144, bounce_rate: null, avg_duration: null, flag_region: 'US' },
    ]
    getPublicDashboard.mockResolvedValue({ ...BASE_PAYLOAD, languages: [], language_groups: groups })

    render(<PublicDashboard siteId="site-1" />)
    await screen.findByTestId('audience')

    const props = audienceSpy.mock.calls.at(-1)?.[0]
    expect(props.languageGroups).toEqual(groups)
    expect(props.languages).toEqual([])
    // The structural guarantee: the share surface never arms a member-only
    // full-list fetch, for languages or any other dimension.
    expect(props.memberFeatures).toBe(false)
  })

  it('falls back to the per-locale languages list when language_groups is absent (older backend)', async () => {
    const languages = [
      { language: 'en-US', pageviews: 189, visitors: 110 },
      { language: 'en-GB', pageviews: 59, visitors: 21 },
    ]
    getPublicDashboard.mockResolvedValue({ ...BASE_PAYLOAD, languages })

    render(<PublicDashboard siteId="site-1" />)
    await screen.findByTestId('audience')

    const props = audienceSpy.mock.calls.at(-1)?.[0]
    expect(props.languageGroups).toBeUndefined()
    expect(props.languages).toEqual(languages)
    expect(props.memberFeatures).toBe(false)
  })
})
