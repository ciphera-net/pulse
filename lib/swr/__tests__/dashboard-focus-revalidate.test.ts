import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// PULSE-226 (a backgrounded tab does not catch up). Same spy pattern as
// campaignsList.test.ts: assert on the actual arguments useSWR is called
// with, not on what the hook source merely appears to pass. The CONFIG
// object is positional argument [2] (key, fetcher, config).
const swrSpy = vi.fn((...args: unknown[]) => {
  void args
  return { data: undefined, error: undefined, isLoading: false, mutate: vi.fn() }
})
vi.mock('swr', () => ({ default: (...args: unknown[]) => swrSpy(...args) }))
vi.mock('swr/infinite', () => ({ default: vi.fn(() => ({ data: undefined, size: 0, setSize: vi.fn() })) }))

import {
  useDashboard,
  useStats,
  useDailyStats,
  usePagesTable,
  useCampaignsList,
  useFunnels,
  useGSCStatus,
  useUptimeStatus,
} from '../dashboard'

const configOf = (): Record<string, unknown> =>
  swrSpy.mock.calls[swrSpy.mock.calls.length - 1][2] as Record<string, unknown>

beforeEach(() => swrSpy.mockClear())

// ---------------------------------------------------------------------------
// 🔴 REGRESSION TEST FOR THE REJECTED COMMIT (6670cb3b, "Today dashboard
// refreshes itself while visible"). That commit replaced useDashboard's
// pre-existing, unconditional 60s `refreshInterval` with `0` for every
// non-live period, on the theory that a new visibility-driven scheduler would
// take over — so Last 7 days, Last 30 days, This month, 3m, 12m, all and year
// would never poll again. This pins the ORIGINAL cadence stays exactly as it
// was on every hook this PR touches.
// ---------------------------------------------------------------------------
describe('PULSE-226: the pre-existing 60s cadence is untouched', () => {
  it('useDashboard keeps refreshInterval 60_000 when not live', () => {
    renderHook(() => useDashboard('s', '2026-10-01', '2026-10-01', 'hour', undefined, 'today'))
    expect(configOf().refreshInterval).toBe(60_000)
  })

  it('useDashboard keeps refreshInterval 15_000 when live (minutes set) — unchanged by this PR', () => {
    renderHook(() => useDashboard('s', '', '', 'minute', undefined, undefined, 5))
    expect(configOf().refreshInterval).toBe(15_000)
  })

  it('useStats keeps refreshInterval 60_000', () => {
    renderHook(() => useStats('s', '2026-10-01', '2026-10-01'))
    expect(configOf().refreshInterval).toBe(60_000)
  })

  it('useDailyStats keeps refreshInterval 60_000', () => {
    renderHook(() => useDailyStats('s', '2026-10-01', '2026-10-01', 'hour'))
    expect(configOf().refreshInterval).toBe(60_000)
  })

  it('usePagesTable keeps refreshInterval 60_000', () => {
    renderHook(() => usePagesTable('s', '2026-10-01', '2026-10-01'))
    expect(configOf().refreshInterval).toBe(60_000)
  })

  it('useCampaignsList keeps refreshInterval 60_000 non-live and 15_000 live', () => {
    renderHook(() => useCampaignsList('s', '2026-10-01', '2026-10-01', 10))
    expect(configOf().refreshInterval).toBe(60_000)

    renderHook(() => useCampaignsList('s', '', '', 10, undefined, true, undefined, 5))
    expect(configOf().refreshInterval).toBe(15_000)
  })
})

// ---------------------------------------------------------------------------
// The actual fix: revalidateOnFocus + a throttle, on the hooks that carry the
// dashboard's 60s cadence. See useDashboard's own comment in lib/swr/dashboard.ts
// for the full SWR citation (node_modules/swr/dist/index/index.mjs — initFocus,
// onRevalidate's FOCUS_EVENT arm, and the polling effect's execute()).
// ---------------------------------------------------------------------------
describe("PULSE-226: revalidateOnFocus is on, throttled to 30s, for the dashboard's 60s hooks", () => {
  const cases: Array<[string, () => void]> = [
    ['useDashboard (today)', () => { renderHook(() => useDashboard('s', '2026-10-01', '2026-10-01', 'hour', undefined, 'today')) }],
    ['useStats', () => { renderHook(() => useStats('s', '2026-10-01', '2026-10-01')) }],
    ['useDailyStats', () => { renderHook(() => useDailyStats('s', '2026-10-01', '2026-10-01', 'hour')) }],
    ['usePagesTable', () => { renderHook(() => usePagesTable('s', '2026-10-01', '2026-10-01')) }],
    ['useCampaignsList', () => { renderHook(() => useCampaignsList('s', '2026-10-01', '2026-10-01', 10)) }],
  ]

  for (const [name, render] of cases) {
    it(`${name}: revalidateOnFocus true, focusThrottleInterval 30_000`, () => {
      render()
      const cfg = configOf()
      expect(cfg.revalidateOnFocus).toBe(true)
      expect(cfg.focusThrottleInterval).toBe(30_000)
    })
  }

  it('useDashboard: live mode (minutes set) stays revalidateOnFocus FALSE — it self-heals off the WebSocket, not focus', () => {
    renderHook(() => useDashboard('s', '', '', 'minute', undefined, undefined, 5))
    expect(configOf().revalidateOnFocus).toBe(false)
  })

  it('useCampaignsList: live mode stays revalidateOnFocus FALSE', () => {
    renderHook(() => useCampaignsList('s', '', '', 10, undefined, true, undefined, 5))
    expect(configOf().revalidateOnFocus).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Hooks deliberately NOT touched by this change keep the base config's
// revalidateOnFocus: false. One representative of each excluded family
// (vendor/checker-paced status, external-sync status, a separately-paced
// checker surface) is enough to prove the shared `dashboardSWRConfig`
// default was not flipped globally by mistake — the reasoning for excluding
// each family is in the PULSE-226 PR description, not repeated per hook here.
// ---------------------------------------------------------------------------
describe('PULSE-226: hooks outside this change keep revalidateOnFocus false', () => {
  it('useFunnels: unchanged', () => {
    renderHook(() => useFunnels('s'))
    expect(configOf().revalidateOnFocus).toBe(false)
  })

  it('useGSCStatus: unchanged (external vendor sync, no benefit from a focus refetch)', () => {
    renderHook(() => useGSCStatus('s'))
    expect(configOf().revalidateOnFocus).toBe(false)
  })

  it('useUptimeStatus: unchanged (paced by its own 60–300s checker, not the frontend)', () => {
    renderHook(() => useUptimeStatus('s', '2026-10-01', '2026-10-01'))
    expect(configOf().revalidateOnFocus).toBe(false)
  })
})
