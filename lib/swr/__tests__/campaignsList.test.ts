import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// Capture the KEY SWR is given. Asserting the arguments the hook is called
// with is not the same assertion: the arguments reach the fetcher, the key
// decides which cache entry the answer is filed under and served from.
// Named `swrSpy`, not `useSWR`: eslint's rules-of-hooks reads a `use*` call
// inside the mock factory as a hook invoked outside a component.
// Typed with an explicit rest parameter: `vi.fn(() => …)` infers a ZERO-arg
// signature, so mock.calls is an array of empty tuples and [0] does not
// typecheck — green under vitest, rejected by tsc.
const swrSpy = vi.fn((..._args: unknown[]) => ({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() }))
vi.mock('swr', () => ({ default: (...args: unknown[]) => swrSpy(...args) }))
vi.mock('swr/infinite', () => ({ default: vi.fn(() => ({ data: undefined, size: 0, setSize: vi.fn() })) }))

import {
  useCampaignsList, useDashboard, useStats, useDailyStats, useCampaigns,
  useUptimeStatus, useUptimeIncidents,
} from '../dashboard'

const keyOf = (): unknown[] | null =>
  swrSpy.mock.calls[swrSpy.mock.calls.length - 1][0] as unknown[] | null

beforeEach(() => swrSpy.mockClear())

describe('useCampaignsList cache key', () => {
  // 🔴 THE DEFECT CLASS THAT CAUSED THE 20-08-2026 REPORT. A card is handed
  // already-resolved dates, so the DATES are its identity. A key that omits
  // them files one range's rows under another range's entry — which is how a
  // customer was shown 30 days of campaigns under a "Today" label.
  it('includes the dates, so one range cannot be served for another', () => {
    renderHook(() => useCampaignsList('site-1', '2026-08-20', '2026-08-20', 10, undefined))
    const today = keyOf()
    renderHook(() => useCampaignsList('site-1', '2026-07-22', '2026-08-20', 10, undefined))
    const thirty = keyOf()

    expect(today).toContain('2026-08-20')
    expect(thirty).toContain('2026-07-22')
    expect(JSON.stringify(today)).not.toBe(JSON.stringify(thirty))
  })

  it('separates the card list from the view-all sheet by limit', () => {
    renderHook(() => useCampaignsList('site-1', '2026-08-20', '2026-08-20', 10, undefined))
    const card = JSON.stringify(keyOf())
    renderHook(() => useCampaignsList('site-1', '2026-08-20', '2026-08-20', 100, undefined))
    expect(JSON.stringify(keyOf())).not.toBe(card)
  })

  it('separates filtered from unfiltered', () => {
    renderHook(() => useCampaignsList('site-1', '2026-08-20', '2026-08-20', 10, undefined))
    const plain = JSON.stringify(keyOf())
    renderHook(() => useCampaignsList('site-1', '2026-08-20', '2026-08-20', 10, 'country==NL'))
    expect(JSON.stringify(keyOf())).not.toBe(plain)
  })

  it('is null while disabled, so the view-all sheet fires nothing until opened', () => {
    renderHook(() => useCampaignsList('site-1', '2026-08-20', '2026-08-20', 100, undefined, false))
    expect(keyOf()).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// The period token is not an identity on its own.
//
// 🔴 These four keys used to read `period || `${start}-${end}``, dropping the
// dates whenever a relative period was sent. `period=today` is the same string
// today and tomorrow, so the entry never invalidated when the local day rolled
// over — a tab left open across midnight served yesterday until the 60s
// refreshInterval happened to move it.
// ---------------------------------------------------------------------------
describe('period-keyed hooks include the dates', () => {
  const D1 = '2026-08-19'
  const D2 = '2026-08-20'

  const cases: Array<[string, (d: string) => void]> = [
    ['useDashboard', d => { renderHook(() => useDashboard('s', d, d, 'hour', undefined, 'today')) }],
    ['useStats', d => { renderHook(() => useStats('s', d, d, undefined, 'today')) }],
    ['useDailyStats', d => { renderHook(() => useDailyStats('s', d, d, 'hour', undefined, 'today')) }],
    ['useCampaigns', d => { renderHook(() => useCampaigns('s', d, d, 100, 'today')) }],
  ]

  for (const [name, render] of cases) {
    it(`${name}: the same period token on a DIFFERENT day is a different key`, () => {
      render(D1)
      const day1 = JSON.stringify(keyOf())
      render(D2)
      const day2 = JSON.stringify(keyOf())
      expect(day1).not.toBe(day2)
      expect(day1).toContain(D1)
      expect(day2).toContain(D2)
    })
  }

  // The paired positive: the token must still be IN the key, or two different
  // periods that happen to span the same dates would collide.
  it('keeps the period token in the key', () => {
    renderHook(() => useDashboard('s', D2, D2, 'hour', undefined, 'today'))
    expect(keyOf()).toContain('today')
  })
})

// ---------------------------------------------------------------------------
// Uptime keyed on siteId ALONE.
//
// 🔴 Every other list hook null-keys on an empty date, which is what lets a
// page withhold its range while the remembered period resolves. These two did
// not, so the uptime page fetched anyway — the gate was applied and had no
// effect, the quietest kind of broken fix.
// ---------------------------------------------------------------------------
describe('uptime hooks require dates', () => {
  it('useUptimeStatus holds when the range is withheld', () => {
    renderHook(() => useUptimeStatus('s', '', ''))
    expect(keyOf()).toBeNull()
  })

  it('useUptimeIncidents holds when the range is withheld', () => {
    renderHook(() => useUptimeIncidents('s', '', ''))
    expect(keyOf()).toBeNull()
  })

  // Paired positives — "always null" would pass both cases above and leave the
  // uptime page permanently empty.
  it('useUptimeStatus fetches once it has dates', () => {
    renderHook(() => useUptimeStatus('s', '2026-08-19', '2026-08-20'))
    expect(keyOf()).toContain('2026-08-19')
  })

  it('useUptimeIncidents fetches once it has dates', () => {
    renderHook(() => useUptimeIncidents('s', '2026-08-19', '2026-08-20'))
    expect(keyOf()).toContain('2026-08-20')
  })
})
