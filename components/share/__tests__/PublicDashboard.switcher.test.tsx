import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

// The share page's view switcher (PULSE-20) and live orb (PULSE-65), plan
// §12: the same twelve rows as every authed page, only today/yesterday/7d/30d
// available, the rest (Custom included) greyed with "A shared dashboard shows
// fixed ranges." — and the orb is DISPLAY-ONLY under the site name, replacing
// the old green "N current visitors" box. Unlike the authed pages, the share
// surface stores nothing (design §11.13 item 5): no useUrlDateRange here, so
// there is no view memory to seed or migrate, only the guarantee that this
// page never touches it either.
//
// DateRangePicker and RealtimeOrb are the REAL components — mocking them
// would just re-assert the props PublicDashboard passes, not what a reader
// actually sees. Mocked here (as share-expiry-reprompt.test.tsx does): the
// two API calls, next/navigation, facet (incl. `cn`, which lib/utils
// re-exports and both real components depend on), and the heavy dashboard
// children, which are covered by their own tests.

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
vi.mock('@/components/dashboard/Locations', () => ({ default: () => null }))
vi.mock('@/components/dashboard/TechSpecs', () => ({ default: () => null }))
vi.mock('@/components/dashboard/ExportModal', () => ({ default: () => null }))
vi.mock('@/components/sites/SiteFavicon', () => ({ SiteFavicon: () => null }))
vi.mock('@/components/skeletons', () => ({
  DashboardSkeleton: () => <div data-testid="skeleton" />,
  useMinimumLoading: (v: boolean) => v,
  useSkeletonFade: () => '',
}))

// buttonVariants is the one extra export the reference mock doesn't need —
// DateRangePicker (real here, unlike the reference test) calls it directly.
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
import { PERIOD_TO_API } from '@/lib/constants/periods'
import { SHARE_FIXED_RANGES_REASON } from '@/lib/view/view'

const dashboardPayload = {
  site: { id: 'site-1', name: 'Acme', domain: 'acme.com', timezone: 'UTC' },
  stats: { pageviews: 1234, visitors: 567, bounce_rate: 40, avg_duration: 30, avg_scroll_depth: 50, avg_visible_duration: 20 },
  realtime_visitors: 4,
  daily_stats: [],
  top_pages: [], entry_pages: [], exit_pages: [], top_referrers: [],
  countries: [], cities: [], regions: [], languages: [], timezones: [],
  browsers: [], os: [], devices: [], screen_resolutions: [],
}

// The eleven named rows, in menu order — the one-menu invariant (§12): the
// same rows everywhere, only availability differs.
const ALL_ROW_KEYS = ['today', 'yesterday', '7', '30', '3m', '12m', 'all', 'month', 'last-month', 'year', 'last-year']
const SHARE_ENABLED_KEYS = ['today', 'yesterday', '7', '30']

function openSwitcher() {
  fireEvent.click(screen.getByRole('button', { name: /^Date range:/ }))
}

beforeEach(() => {
  vi.clearAllMocks()
  getPublicDashboard.mockResolvedValue(dashboardPayload)
  getPublicRealtime.mockResolvedValue({ visitors: 4 })
})

describe('PublicDashboard — the view switcher and live orb (PULSE-20/65)', () => {
  it('renders the orb display-only under the site name, and drops the old "current visitors" box', async () => {
    render(<PublicDashboard siteId="site-1" />)
    await screen.findByTestId('deck')

    const orb = document.querySelector('[data-live-orb]')
    expect(orb).toBeTruthy()
    // Display-only: no onToggle, so RealtimeOrb renders a <span role="status">,
    // never the <button> the toggle variant would be.
    expect(orb?.tagName).toBe('SPAN')
    expect(orb?.getAttribute('data-live-orb')).toBe('display')
    expect(orb?.getAttribute('role')).toBe('status')
    expect(orb?.textContent).toContain('4')
    expect(screen.queryByRole('button', { name: /realtime/i })).toBeNull()

    // The third design for one signal — the green "N current visitors" box
    // this replaced (approved mock share-a, 25-09-2026).
    expect(screen.queryByText(/current visitors/i)).toBeNull()
  })

  it('opens on the same eleven rows + Custom range…, only the four fixed windows enabled', async () => {
    render(<PublicDashboard siteId="site-1" />)
    await screen.findByTestId('deck')

    openSwitcher()

    expect(document.querySelectorAll('[data-row]')).toHaveLength(ALL_ROW_KEYS.length + 1)

    for (const key of ALL_ROW_KEYS) {
      const row = document.querySelector(`[data-row="${key}"]`) as HTMLButtonElement
      expect(row, `row "${key}" is in the menu`).toBeTruthy()
      if (SHARE_ENABLED_KEYS.includes(key)) {
        expect(row.disabled, `row "${key}" is enabled`).toBe(false)
      } else {
        expect(row.disabled, `row "${key}" is greyed`).toBe(true)
        expect(row.title).toBe(SHARE_FIXED_RANGES_REASON)
      }
    }

    const customRow = document.querySelector('[data-row="custom"]') as HTMLButtonElement
    expect(customRow.disabled).toBe(true)
    expect(customRow.title).toBe(SHARE_FIXED_RANGES_REASON)
    expect(customRow.textContent).toContain('Custom range…')

    // The footnote under the list carries the same line (§12).
    expect(screen.getByText(SHARE_FIXED_RANGES_REASON)).toBeTruthy()
  })

  it('has no shift arrows — nothing here can ask for a range outside the allowlist', async () => {
    render(<PublicDashboard siteId="site-1" />)
    await screen.findByTestId('deck')
    expect(screen.queryByRole('button', { name: /shift range/i })).toBeNull()
  })

  it('picking Last 7 days refetches with the period token, not dates', async () => {
    render(<PublicDashboard siteId="site-1" />)
    await screen.findByTestId('deck')
    getPublicDashboard.mockClear()

    openSwitcher()
    fireEvent.click(document.querySelector('[data-row="7"]') as HTMLButtonElement)

    await waitFor(() => expect(getPublicDashboard).toHaveBeenCalled())
    const call = getPublicDashboard.mock.calls.at(-1) as unknown[]
    // getPublicDashboard(siteId, startDate, endDate, limit, interval, period) —
    // never start/end: a shared dashboard always sends an allowlisted token.
    expect(call[1]).toBeUndefined()
    expect(call[2]).toBeUndefined()
    expect(call[5]).toBe(PERIOD_TO_API['7'])
    expect(call[5]).toBe('7d')
  })

  it('never reads or writes the one view memory — an anonymous viewer, fixed ranges', async () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem')
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')

    render(<PublicDashboard siteId="site-1" />)
    await screen.findByTestId('deck')

    openSwitcher()
    fireEvent.click(document.querySelector('[data-row="7"]') as HTMLButtonElement)
    await waitFor(() => expect(getPublicDashboard).toHaveBeenCalledTimes(2))

    const touched = [...getItemSpy.mock.calls, ...setItemSpy.mock.calls].map((c) => String(c[0]))
    expect(touched).not.toContain('pulse_view')
    expect(touched).not.toContain('pulse_view_range')

    getItemSpy.mockRestore()
    setItemSpy.mockRestore()
  })
})
