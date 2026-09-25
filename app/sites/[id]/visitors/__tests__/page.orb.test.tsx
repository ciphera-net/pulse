import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import React from 'react'

// The Visitors roster's own toolbar (PULSE-20/65, plan §12 + handover-2 §3
// item 2): the orb sits directly left of the switcher (approved mock
// d1-visitors, 25-09-2026), toggling the page into the dashboard's realtime
// MODE (5 rolling minutes, never remembered) rather than one of Visitors' own
// (retired) live-window presets. useUrlDateRange, DateRangePicker and
// RealtimeOrb are the REAL implementations here — only the data layer
// (lib/swr/dashboard) and next/navigation are mocked.
//
// The navigation mock is STATEFUL, not a frozen snapshot: entering realtime
// writes ?period=realtime through the real hook's own router.replace(), which
// this file's mock actually applies to a shared `mockSearchParams`, so a
// forced `rerender()` afterwards sees exactly what Next's own App Router
// would have delivered — a plain reassignment would never observe the click.

let mockSearchParams = new URLSearchParams()
// Unique per test: useQueryParamsWriter keeps a MODULE-LEVEL `pending` write
// cache keyed by pathname, alive for this whole file (not reset between `it()`
// blocks) — a shared pathname would let one test's in-flight write be reused
// as another's base within its 2s freshness window. A fresh pathname per test
// sidesteps that regardless of timing.
let mockPathname = '/sites/site-1/visitors'
let pathnameCounter = 0

const mockRouterReplace = vi.fn((url: string) => {
  const q = url.includes('?') ? url.slice(url.indexOf('?') + 1) : ''
  mockSearchParams = new URLSearchParams(q)
})

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'site-1' }),
  usePathname: () => mockPathname,
  useRouter: () => ({ replace: mockRouterReplace, push: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}))

const mockUseVisitors = vi.fn()

vi.mock('@/lib/swr/dashboard', () => ({
  useSite: () => ({ data: SITE, mutate: vi.fn() }),
  // null = the data window is unknown, which greys nothing (lib/view/view.ts).
  useDataWindow: () => null,
  useVisitors: (...a: unknown[]) => mockUseVisitors(...a),
}))

import VisitorsPage from '../page'
import { REALTIME_EMPTY_LINE } from '@/lib/dashboard/realtimeRange'

const SITE = {
  id: 'site-1',
  user_id: 'u1',
  domain: 'acme.com',
  name: 'Acme',
  timezone: 'UTC',
  visitor_views_enabled: true,
  identity_window_days: 0,
  data_retention_months: 0,
}

const EMPTY_RESPONSE = {
  visitors: [] as unknown[],
  total: 0,
  page: 1,
  page_size: 10,
  site_timezone: 'UTC',
  range_floor: '2026-08-26T00:00:00Z',
  // The one number the orb, the roster badge and every row's dot all read —
  // distinct from 0/1 so a test that reads the wrong source is visible.
  active_now: 7,
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-26T12:00:00Z'))
  pathnameCounter += 1
  mockPathname = `/sites/site-1/visitors#${pathnameCounter}`
  mockSearchParams = new URLSearchParams()
  mockUseVisitors.mockReset()
  mockUseVisitors.mockReturnValue({ data: EMPTY_RESPONSE, error: undefined, isLoading: false })
})

afterEach(() => {
  vi.useRealTimers()
})

function orbToggle(): HTMLElement {
  return document.querySelector('[data-live-orb="toggle"]') as HTMLElement
}

function switcherTrigger(): HTMLElement {
  return document.querySelector('[data-tour="date-range-picker"]') as HTMLElement
}

describe('Visitors roster — the orb and the one view switcher (PULSE-20/65)', () => {
  it('places the orb directly before the switcher, in the same toolbar', async () => {
    render(<VisitorsPage />)
    await act(async () => {})

    const orb = orbToggle()
    const trigger = switcherTrigger()
    expect(orb).toBeTruthy()
    expect(trigger).toBeTruthy()
    // "Directly left of the switcher" (approved mock d1-visitors): the orb's
    // own next sibling is the picker's wrapper, which holds the trigger.
    expect(orb.nextElementSibling?.contains(trigger)).toBe(true)
  })

  it("the orb count is the roster's own active_now — the same number everywhere on this page", async () => {
    render(<VisitorsPage />)
    await act(async () => {})
    expect(orbToggle().textContent).toContain('7')
  })

  it('drops the old bordered "N on the site now" header chip', async () => {
    render(<VisitorsPage />)
    await act(async () => {})
    // Scoped to the PAGE HEADER specifically: PresenceField carries its own,
    // unrelated "<activeCount> on the site now" overlay on the field itself
    // (a legitimate, pre-existing device), so an unscoped query would flag a
    // chip this change never touched. The bordered header chip this removed
    // printed "<count> on the site now" beside the title; the live-mode
    // roster heading now prints "On the site now" with no count prefix, and
    // the badge prints "N right now" / "N in range" — neither collides.
    const header = screen.getByRole('heading', { name: 'Visitors' }).closest('.flex.flex-wrap') as HTMLElement
    expect(within(header).queryByText(/\d+\s+on the site now\b/)).toBeNull()
  })

  it('clicking the orb puts the page in realtime — useVisitors is then called with { minutes: 5 }', async () => {
    const { rerender } = render(<VisitorsPage />)
    await act(async () => {})
    mockUseVisitors.mockClear()

    fireEvent.click(orbToggle())
    // The mocked router.replace above already applied the write; force the
    // re-render Next's own navigation would have triggered on its own.
    rerender(<VisitorsPage />)
    await act(async () => {})

    const sawFiveMinutes = mockUseVisitors.mock.calls.some(
      (call) => (call[1] as { minutes?: number } | undefined)?.minutes === 5,
    )
    expect(sawFiveMinutes).toBe(true)
  })

  it('an empty roster in realtime reads exactly "Nobody on the site in the last 5 minutes."', async () => {
    const { rerender } = render(<VisitorsPage />)
    await act(async () => {})
    fireEvent.click(orbToggle())
    rerender(<VisitorsPage />)
    await act(async () => {})

    // Scoped to the roster panel (not the presence field above it, which
    // shows the same line in its own empty state) via the column-header row
    // that is always in the roster, live or not.
    const rosterPanel = screen.getByText('Visitor').closest('.rounded-none') as HTMLElement
    expect(within(rosterPanel).getByText(REALTIME_EMPTY_LINE)).toBeTruthy()
  })

  it('with the URL period=all, useVisitors receives period "all"', async () => {
    mockSearchParams = new URLSearchParams('period=all')
    render(<VisitorsPage />)
    await act(async () => {})

    const sawAll = mockUseVisitors.mock.calls.some(
      (call) => (call[1] as { period?: string } | undefined)?.period === 'all',
    )
    expect(sawAll).toBe(true)
  })
})
