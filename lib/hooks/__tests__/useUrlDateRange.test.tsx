import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  useUrlDateRange,
  readStoredView,
  VIEW_KEY,
  VIEW_RANGE_KEY,
  LEGACY_VIEW_KEYS,
  SEARCH_CONSOLE_MAX_DAYS,
  type PageRangeOptions,
} from '../useUrlDateRange'
import { previousDateRange, DEFAULT_PERIOD } from '../periodUrl'
import { PERIOD_PRESETS, CUSTOM_RANGE_LABEL } from '@/lib/constants/periods'
import type { Surface, WindowState, DataWindow } from '@/lib/view/view'

// ---------------------------------------------------------------------------
// Rewritten for the ONE-MEMORY contract (owner decision 25-09-2026, PULSE-20 —
// reversing the 22-08-2026 per-page ruling this file used to pin). The old
// contract's `pageKey` / `extraPresets` / `exclusive` / `excludePresets` /
// `pickerProps` are gone from PageRangeOptions; a page now declares `surface`
// + its DATA WINDOW instead, and greying/closest-view/clamp all live in
// lib/view/view.ts (tested on its own — this file covers the HOOK: the one
// memory, readiness, and URL/session mechanics around it).
// Plan: Pulse/docs/plans/22-09-2026-unified-time-range-design.md §12
// (§11.12–11.15 for the memory + closest-view reasoning).
//
// 🔴 Deliberately NOT mocking @/lib/utils/dateRanges (unlike the old file).
// resolveView/view.ts does real day arithmetic (spanDays/addDays/formatSpan)
// on whatever the preset resolvers return, so feeding it placeholder strings
// like `'30-start'` breaks that arithmetic silently. The resolvers are pure
// given `now` (siteWallClockNow bridges the site's zone to LOCAL date
// getters, so they round-trip correctly regardless of the runner's own TZ) —
// pin `now` with fake timers instead of stubbing the date math.
// ---------------------------------------------------------------------------

const mockReplace = vi.fn()
let mockSearchParams = new URLSearchParams()
// Each test gets its own pathname so useQueryParamsWriter's module-level
// `pending` cache (keyed on pathname) can never carry a write from one test
// into the next — that module state outlives any per-test storage.clear().
let mockPathname = '/test-0'
let pathnameCounter = 0

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => mockPathname,
}))

// "Today is 2026-09-26" throughout, per the run's pinned clock — individual
// tests override vi.setSystemTime only where they need a different `now`.
const FIXED_NOW = new Date('2026-09-26T12:00:00Z')

beforeEach(() => {
  mockReplace.mockClear()
  mockSearchParams = new URLSearchParams()
  mockPathname = `/test-${++pathnameCounter}`
  window.localStorage.clear()
  window.sessionStorage.clear()
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** A page's declaration — surface + data window are the only required fields. */
function opts(surface: Surface, overrides: Partial<PageRangeOptions> = {}): PageRangeOptions {
  return { surface, window: null, timezone: 'UTC', ...overrides }
}

// ---------------------------------------------------------------------------
// URL round-trip — unchanged mechanics, new options shape.
// ---------------------------------------------------------------------------
describe('URL round-trip', () => {
  it('defaults to period 30 with its computed range', () => {
    const { result } = renderHook(() => useUrlDateRange(opts('dashboard')))
    expect(result.current.period).toBe('30')
    expect(result.current.dateRange).toEqual({ start: '2026-08-28', end: '2026-09-26' })
  })

  it('reads a preset period from the URL', () => {
    mockSearchParams = new URLSearchParams('period=7')
    const { result } = renderHook(() => useUrlDateRange(opts('dashboard')))
    expect(result.current.period).toBe('7')
    expect(result.current.dateRange).toEqual({ start: '2026-09-20', end: '2026-09-26' })
  })

  it('reads a custom range from the URL when valid', () => {
    mockSearchParams = new URLSearchParams('period=custom&start=2026-01-01&end=2026-01-31')
    const { result } = renderHook(() => useUrlDateRange(opts('dashboard')))
    expect(result.current.period).toBe('custom')
    expect(result.current.dateRange).toEqual({ start: '2026-01-01', end: '2026-01-31' })
  })

  it('normalizes period=custom with missing or malformed dates to the default', () => {
    mockSearchParams = new URLSearchParams('period=custom')
    expect(renderHook(() => useUrlDateRange(opts('dashboard'))).result.current.period).toBe('30')
    mockSearchParams = new URLSearchParams('period=custom&start=garbage&end=2026-01-31')
    expect(renderHook(() => useUrlDateRange(opts('dashboard'))).result.current.period).toBe('30')
  })

  it('setPeriod custom writes period/start/end; presets strip them', () => {
    const { result } = renderHook(() => useUrlDateRange(opts('dashboard')))
    act(() => {
      result.current.setPeriod('custom', { start: '2026-01-01', end: '2026-01-31' })
    })
    let calledWith = mockReplace.mock.calls[0][0] as string
    expect(calledWith).toContain('period=custom')
    expect(calledWith).toContain('start=2026-01-01')
    expect(calledWith).toContain('end=2026-01-31')

    mockSearchParams = new URLSearchParams('period=custom&start=2026-01-01&end=2026-01-31')
    const { result: r2 } = renderHook(() => useUrlDateRange(opts('dashboard')))
    mockReplace.mockClear()
    act(() => {
      r2.current.setPeriod('7')
    })
    calledWith = mockReplace.mock.calls[0][0] as string
    expect(calledWith).toContain('period=7')
    expect(calledWith).not.toContain('start=')
    expect(calledWith).not.toContain('end=')
  })

  it('omits the default period from the URL', () => {
    mockSearchParams = new URLSearchParams('period=7')
    const { result } = renderHook(() => useUrlDateRange(opts('dashboard')))
    act(() => {
      result.current.setPeriod('30')
    })
    const calledWith = mockReplace.mock.calls[0][0] as string
    expect(calledWith).not.toContain('period=')
  })

  it('shiftPeriod moves a custom range back by its own span', () => {
    mockSearchParams = new URLSearchParams('period=custom&start=2026-01-08&end=2026-01-14')
    const { result } = renderHook(() => useUrlDateRange(opts('dashboard')))
    act(() => {
      result.current.shiftPeriod(-1)
    })
    const calledWith = mockReplace.mock.calls[0][0] as string
    expect(calledWith).toContain('start=2026-01-01')
    expect(calledWith).toContain('end=2026-01-07')
  })

  it('shiftPeriod forward clamps at today (no-op past it)', () => {
    mockSearchParams = new URLSearchParams('period=custom&start=2099-01-01&end=2099-01-07')
    const { result } = renderHook(() => useUrlDateRange(opts('dashboard')))
    act(() => {
      result.current.shiftPeriod(1)
    })
    expect(mockReplace).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// siteNow — the wall clock every resolver in this hook uses (18-09-2026
// preset-site-zone alignment). Unchanged behaviour, new options shape.
// ---------------------------------------------------------------------------
describe('siteNow', () => {
  it('is a Date whose local getters equal the given site zone wall clock', () => {
    // 19:30Z is 2026-09-19 00:30 in Asia/Karachi (UTC+5, no DST).
    vi.setSystemTime(new Date('2026-09-18T19:30:00Z'))
    const { result } = renderHook(() => useUrlDateRange(opts('dashboard', { timezone: 'Asia/Karachi' })))
    expect(result.current.siteNow.getFullYear()).toBe(2026)
    expect(result.current.siteNow.getMonth()).toBe(8)
    expect(result.current.siteNow.getDate()).toBe(19)
    expect(result.current.siteNow.getHours()).toBe(0)
    expect(result.current.siteNow.getMinutes()).toBe(30)
  })

  it('degrades to UTC when the caller passes timezone: null (CDN — Bunny UTC days)', () => {
    vi.setSystemTime(new Date('2026-09-18T19:30:00Z'))
    const { result } = renderHook(() => useUrlDateRange(opts('cdn', { timezone: null })))
    expect(result.current.siteNow.getFullYear()).toBe(2026)
    expect(result.current.siteNow.getMonth()).toBe(8)
    expect(result.current.siteNow.getDate()).toBe(18)
    expect(result.current.siteNow.getHours()).toBe(19)
    expect(result.current.siteNow.getMinutes()).toBe(30)
  })
})

// ---------------------------------------------------------------------------
// previousDateRange — unchanged pure function, unchanged tests.
// ---------------------------------------------------------------------------
describe('previousDateRange rejects what it cannot parse', () => {
  it('returns null for an empty range — the shape a withheld range has', () => {
    expect(previousDateRange({ start: '', end: '' })).toBeNull()
  })

  it('returns null for a malformed range', () => {
    expect(previousDateRange({ start: 'not-a-date', end: 'nor-this' })).toBeNull()
  })

  it('returns null when only one end is missing', () => {
    expect(previousDateRange({ start: '2026-08-20', end: '' })).toBeNull()
    expect(previousDateRange({ start: '', end: '2026-08-20' })).toBeNull()
  })

  it('still computes the preceding window for a real range', () => {
    expect(previousDateRange({ start: '2026-08-20', end: '2026-08-20' })).toEqual({
      start: '2026-08-19',
      end: '2026-08-19',
    })
    expect(previousDateRange({ start: '2026-08-14', end: '2026-08-20' })).toEqual({
      start: '2026-08-07',
      end: '2026-08-13',
    })
  })

  it('never returns a NaN-shaped date', () => {
    for (const r of [{ start: '', end: '' }, { start: 'x', end: 'y' }, { start: '2026-08-20', end: '' }]) {
      const out = previousDateRange(r)
      expect(out === null || (!out.start.includes('NaN') && !out.end.includes('NaN'))).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// The one memory (25-09-2026): global across sites and surfaces, one name.
// ---------------------------------------------------------------------------
describe('one memory (PULSE-20, 25-09-2026): global, one name, one row', () => {
  it('remembers a chosen preset and applies it on a bare-URL mount, on ANY surface', () => {
    const { result } = renderHook(() => useUrlDateRange(opts('dashboard')))
    act(() => {
      result.current.setPeriod('7')
    })
    expect(window.localStorage.getItem(VIEW_KEY)).toBe('7')

    // A different surface, a fresh bare mount — no site id anywhere in the
    // options, so there is nothing FOR the memory to be scoped by.
    mockSearchParams = new URLSearchParams()
    const { result: r2 } = renderHook(() => useUrlDateRange(opts('search')))
    expect(r2.current.period).toBe('7')
    expect(r2.current.dateRange).toEqual({ start: '2026-09-20', end: '2026-09-26' })
  })

  it('picking the default period while another view is stored does not revert', () => {
    window.localStorage.setItem(VIEW_KEY, '7')
    const { result } = renderHook(() => useUrlDateRange(opts('dashboard')))
    expect(result.current.period).toBe('7')
    act(() => {
      result.current.setPeriod('30')
    })
    expect(result.current.period).toBe('30')
    expect(window.localStorage.getItem(VIEW_KEY)).toBe('30')
  })

  it('an explicit URL period always wins over the memory', () => {
    window.localStorage.setItem(VIEW_KEY, '7')
    mockSearchParams = new URLSearchParams('period=today')
    const { result } = renderHook(() => useUrlDateRange(opts('dashboard')))
    expect(result.current.period).toBe('today')
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('custom ranges are NOT the named memory — a frozen span never becomes the default', () => {
    window.localStorage.setItem(VIEW_KEY, '7')
    const { result } = renderHook(() => useUrlDateRange(opts('dashboard')))
    act(() => {
      result.current.setPeriod('custom', { start: '2026-01-01', end: '2026-01-31' })
    })
    expect(window.localStorage.getItem(VIEW_KEY)).toBe('7')
  })

  it('garbage in storage never becomes the period', () => {
    window.localStorage.setItem(VIEW_KEY, 'nonsense')
    const { result } = renderHook(() => useUrlDateRange(opts('dashboard')))
    expect(result.current.period).toBe('30')
  })

  it('the key is pulse_view — not the pre-PULSE-20 pulse_last_period — and survives a remount even if the old shared key is still lying around', () => {
    expect(VIEW_KEY).toBe('pulse_view')
    expect(VIEW_KEY).not.toBe('pulse_last_period')
    window.localStorage.setItem(VIEW_KEY, '7')
    window.localStorage.setItem('pulse_last_period', 'today')
    const { result: first } = renderHook(() => useUrlDateRange(opts('dashboard')))
    expect(first.current.period).toBe('7')

    // A remount (a navigation) must not have run the old unconditional
    // removeItem('pulse_last_period') and taken the new key down with it —
    // that was the trap named in §11.13: reusing the old name makes the new
    // memory erase itself on every mount, with every test green.
    const { result: second } = renderHook(() => useUrlDateRange(opts('search')))
    expect(second.current.period).toBe('7')
    expect(window.localStorage.getItem(VIEW_KEY)).toBe('7')
    expect(window.localStorage.getItem('pulse_last_period')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Only a pick or an arrow writes. Everything else that can produce a
// PLACEHOLDER-looking period — a shared link, a remount, restoreView, a
// closest view, a clamp — must never touch either storage (§11.14 rule 3).
// ---------------------------------------------------------------------------
describe('only a pick or an arrow writes storage', () => {
  it('an explicit ?period= on empty storage never writes', () => {
    mockSearchParams = new URLSearchParams('period=7')
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    renderHook(() => useUrlDateRange(opts('dashboard')))
    expect(setItemSpy).not.toHaveBeenCalled()
  })

  it('a remount of an already-stored view never re-writes it', () => {
    window.localStorage.setItem(VIEW_KEY, '7')
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    renderHook(() => useUrlDateRange(opts('search')))
    expect(setItemSpy).not.toHaveBeenCalled()
  })

  it('restoreView writes the URL only', () => {
    const { result } = renderHook(() => useUrlDateRange(opts('dashboard')))
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    act(() => {
      result.current.restoreView({ period: '7' })
    })
    expect(mockReplace).toHaveBeenCalled()
    expect(setItemSpy).not.toHaveBeenCalled()
  })

  it('a closest view never writes storage', () => {
    window.localStorage.setItem(VIEW_KEY, 'today')
    const dataWindow: DataWindow = { from: '2026-03-01', through: '2026-09-24' }
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    renderHook(() => useUrlDateRange(opts('search', { window: dataWindow })))
    expect(setItemSpy).not.toHaveBeenCalled()
  })

  it('a ceiling clamp never writes storage', () => {
    // '16m' (480 days) on the default 366-day analytics ceiling clamps.
    mockSearchParams = new URLSearchParams('period=16m')
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    renderHook(() => useUrlDateRange(opts('dashboard')))
    expect(setItemSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Session range: a custom or arrow-shifted span follows the reader until the
// tab closes (sessionStorage), wins over the named memory in that tab, and
// never lands in the named key.
// ---------------------------------------------------------------------------
describe('session range: custom and arrow-shifted spans follow the reader for one tab', () => {
  it('a custom pick writes sessionStorage, never the named memory', () => {
    const { result } = renderHook(() => useUrlDateRange(opts('dashboard')))
    act(() => {
      result.current.setPeriod('7')
    })
    act(() => {
      result.current.setPeriod('custom', { start: '2026-01-01', end: '2026-01-31' })
    })
    expect(JSON.parse(window.sessionStorage.getItem(VIEW_RANGE_KEY)!)).toEqual({
      start: '2026-01-01',
      end: '2026-01-31',
    })
    expect(window.localStorage.getItem(VIEW_KEY)).toBe('7')
  })

  it('the session range wins over the named memory in the same tab', () => {
    window.localStorage.setItem(VIEW_KEY, '7')
    window.sessionStorage.setItem(VIEW_RANGE_KEY, JSON.stringify({ start: '2026-02-01', end: '2026-02-10' }))
    const { result } = renderHook(() => useUrlDateRange(opts('dashboard')))
    expect(result.current.requestedPeriod).toBe('custom')
    expect(result.current.requested.range).toEqual({ start: '2026-02-01', end: '2026-02-10' })
  })

  it('a named pick afterwards clears the session range', () => {
    const { result } = renderHook(() => useUrlDateRange(opts('dashboard')))
    act(() => {
      result.current.setPeriod('custom', { start: '2026-01-01', end: '2026-01-31' })
    })
    expect(window.sessionStorage.getItem(VIEW_RANGE_KEY)).not.toBeNull()
    act(() => {
      result.current.setPeriod('30')
    })
    expect(window.sessionStorage.getItem(VIEW_RANGE_KEY)).toBeNull()
  })

  it('an arrow shift is remembered the same way as a custom pick — session, never pulse_view', () => {
    mockSearchParams = new URLSearchParams('period=custom&start=2026-01-08&end=2026-01-14')
    const { result } = renderHook(() => useUrlDateRange(opts('dashboard')))
    act(() => {
      result.current.shiftPeriod(-1)
    })
    expect(JSON.parse(window.sessionStorage.getItem(VIEW_RANGE_KEY)!)).toEqual({
      start: '2026-01-01',
      end: '2026-01-07',
    })
    expect(window.localStorage.getItem(VIEW_KEY)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Migration onto the one key (§11.13 rule 7): dashboard first, then the
// fixed LEGACY_VIEW_KEYS order, garbage ignored, every legacy key removed
// regardless, an existing pulse_view is never overwritten.
// ---------------------------------------------------------------------------
describe('migration onto the one key', () => {
  it('seeds from the dashboard key first, even when other legacy keys hold different values', () => {
    window.localStorage.setItem('pulse_last_period:dashboard', '7')
    window.localStorage.setItem('pulse_last_period:pages', 'today')
    window.localStorage.setItem('pulse_last_period:funnels', '30')
    expect(readStoredView()).toEqual({ period: '7' })
    expect(window.localStorage.getItem(VIEW_KEY)).toBe('7')
  })

  it('falls through the fixed LEGACY_VIEW_KEYS order when the dashboard key is missing', () => {
    window.localStorage.setItem('pulse_last_period:pages', 'today')
    window.localStorage.setItem('pulse_last_period:visitors', '30')
    expect(readStoredView()).toEqual({ period: 'today' })
  })

  it('ignores garbage and non-row values on the way to a real one', () => {
    window.localStorage.setItem('pulse_last_period:dashboard', '16m') // legacy grammar, not a row
    window.localStorage.setItem('pulse_last_period:pages', 'custom') // a token, never a stored row
    window.localStorage.setItem('pulse_last_period:visitors', 'realtime') // a mode, never storable
    window.localStorage.setItem('pulse_last_period:funnels', 'xyz') // outright garbage
    window.localStorage.setItem('pulse_last_period:journeys', '30') // first real row in order
    expect(readStoredView()).toEqual({ period: '30' })
  })

  it('removes every legacy key regardless of which one seeded the value', () => {
    for (const key of LEGACY_VIEW_KEYS) window.localStorage.setItem(key, 'today')
    readStoredView()
    for (const key of LEGACY_VIEW_KEYS) expect(window.localStorage.getItem(key)).toBeNull()
  })

  it('never lets a legacy value overwrite an existing pulse_view', () => {
    window.localStorage.setItem(VIEW_KEY, 'today')
    window.localStorage.setItem('pulse_last_period:dashboard', '7')
    expect(readStoredView()).toEqual({ period: 'today' })
    expect(window.localStorage.getItem(VIEW_KEY)).toBe('today')
    // Still cleaned up — an existing pulse_view stops it winning, not the cleanup.
    expect(window.localStorage.getItem('pulse_last_period:dashboard')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Modes (realtime): never remembered, and 'remembered' never reports one —
// even defensively, if a page ever mis-declares a named row as a mode too.
// ---------------------------------------------------------------------------
describe('modes are never remembered (PULSE-65, 23-09-2026)', () => {
  it('setPeriod writes the URL but never storage for a declared mode', () => {
    const { result } = renderHook(() => useUrlDateRange(opts('dashboard', { modes: ['realtime'] })))
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
    act(() => {
      result.current.setPeriod('realtime')
    })
    expect(mockReplace).toHaveBeenCalled()
    expect(setItemSpy).not.toHaveBeenCalled()
  })

  it('remembered is never a mode, even right after entering one', () => {
    const { result } = renderHook(() => useUrlDateRange(opts('dashboard', { modes: ['realtime'] })))
    act(() => {
      result.current.setPeriod('7')
    })
    expect(result.current.remembered).toEqual({ period: '7' })
    act(() => {
      result.current.setPeriod('realtime')
    })
    expect(result.current.remembered).toEqual({ period: '7' })
  })

  // Defence in depth: a named row that a page ALSO declares as a mode must
  // still be refused as memory, or one bad `modes` list traps a reader in a
  // view they never asked to keep (the same defence useUrlDateRange.ts's
  // `requested` comment names for the read side, tested next).
  it('a named row declared as a mode is still refused as memory', () => {
    const { result } = renderHook(() => useUrlDateRange(opts('dashboard', { modes: ['today'] })))
    act(() => {
      result.current.setPeriod('today')
    })
    expect(window.localStorage.getItem(VIEW_KEY)).toBeNull()
  })

  it('a stored value matching a declared mode is refused as the requested view on mount', () => {
    window.localStorage.setItem(VIEW_KEY, 'today')
    const { result } = renderHook(() => useUrlDateRange(opts('dashboard', { modes: ['today'] })))
    expect(result.current.requestedPeriod).toBe(DEFAULT_PERIOD)
  })
})

// ---------------------------------------------------------------------------
// periodReady — the three gates: memory (or a URL period), timezone, window.
// ---------------------------------------------------------------------------
describe('periodReady — the three gates', () => {
  function renderTrace(o: PageRangeOptions) {
    const seen: Array<{ period: string; ready: boolean }> = []
    renderHook(() => {
      const r = useUrlDateRange(o)
      seen.push({ period: r.period, ready: r.periodReady })
      return r
    })
    return seen
  }

  it('is not ready on the render that reports the placeholder period, ready once memory resolves', () => {
    window.localStorage.setItem(VIEW_KEY, 'today')
    const seen = renderTrace(opts('dashboard'))
    expect(seen[0]).toEqual({ period: DEFAULT_PERIOD, ready: false })
    expect(seen[seen.length - 1]).toEqual({ period: 'today', ready: true })
  })

  it('is ready on the very first render when the URL already carries a period', () => {
    mockSearchParams = new URLSearchParams('period=today')
    const seen = renderTrace(opts('dashboard'))
    expect(seen[0]).toEqual({ period: 'today', ready: true })
  })

  it('waits for the timezone even with an explicit URL period', () => {
    mockSearchParams = new URLSearchParams('period=today')
    const { result } = renderHook(() => useUrlDateRange(opts('dashboard', { timezone: undefined })))
    expect(result.current.periodReady).toBe(false)
  })

  it('waits for the data window even with a known timezone and an explicit period', () => {
    mockSearchParams = new URLSearchParams('period=today')
    const { result } = renderHook(() => useUrlDateRange(opts('dashboard', { window: undefined })))
    expect(result.current.periodReady).toBe(false)
  })

  it('a known-empty window (null) counts as known, not as still loading', () => {
    const { result, rerender } = renderHook(
      ({ window: dataWindow }: { window: WindowState }) => useUrlDateRange(opts('dashboard', { window: dataWindow })),
      { initialProps: { window: undefined as WindowState } },
    )
    expect(result.current.periodReady).toBe(false)
    rerender({ window: null })
    expect(result.current.periodReady).toBe(true)
  })

  it('a rolling-minutes period is ready without either the timezone or the window', () => {
    mockSearchParams = new URLSearchParams('period=realtime')
    const { result } = renderHook(() =>
      useUrlDateRange(
        opts('dashboard', { timezone: undefined, window: undefined, rollingMinutes: { realtime: 5 } }),
      ),
    )
    expect(result.current.period).toBe('realtime')
    expect(result.current.rollingMinutes).toBe(5)
    expect(result.current.periodReady).toBe(true)
  })

  it('a non-rolling period on the same page still waits — rollingMinutes is per-period, not per-page', () => {
    mockSearchParams = new URLSearchParams('period=today')
    const { result } = renderHook(() =>
      useUrlDateRange(
        opts('dashboard', { timezone: undefined, window: undefined, rollingMinutes: { realtime: 5 } }),
      ),
    )
    expect(result.current.rollingMinutes).toBeNull()
    expect(result.current.periodReady).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// The closest view (§11.15): the most recent span of the same kind and
// length that has data on THIS page — fetched as a concrete range, the
// memory left exactly as it was asked.
// ---------------------------------------------------------------------------
describe('the closest view', () => {
  it('Today with no data today resolves to the latest day with data, and never touches memory', () => {
    window.localStorage.setItem(VIEW_KEY, 'today')
    const dataWindow: DataWindow = { from: '2026-03-01', through: '2026-09-24' }
    const { result } = renderHook(() => useUrlDateRange(opts('search', { window: dataWindow })))

    expect(result.current.period).toBe('custom')
    expect(result.current.dateRange).toEqual({ start: '2026-09-24', end: '2026-09-24' })
    expect(result.current.requestedPeriod).toBe('today')
    expect(result.current.picker.label).toBe('24 Sep')
    expect(result.current.picker.suffix).toBe('latest day')
    expect(result.current.picker.tick).toBeNull()
    expect(window.localStorage.getItem(VIEW_KEY)).toBe('today')
  })

  it('ticks Yesterday when the newest day with data happens to BE yesterday', () => {
    const dataWindow: DataWindow = { from: '2026-01-01', through: '2026-09-25' }
    mockSearchParams = new URLSearchParams('period=today')
    const { result } = renderHook(() => useUrlDateRange(opts('journeys', { window: dataWindow })))
    expect(result.current.picker.tick).toBe('yesterday')
    expect(result.current.picker.label).toBe('Yesterday')
  })
})

// ---------------------------------------------------------------------------
// The ceiling clamp: a carried span over the page's API ceiling is clamped
// KEEPING ITS END DATE — never sent past 366 days (480 on Search).
// ---------------------------------------------------------------------------
describe('the ceiling clamp', () => {
  it('clamps a 500-day session range to 366 days on the default analytics ceiling, keeping the end date', () => {
    window.sessionStorage.setItem(VIEW_RANGE_KEY, JSON.stringify({ start: '2024-08-20', end: '2026-01-01' }))
    const { result } = renderHook(() => useUrlDateRange(opts('dashboard')))
    expect(result.current.period).toBe('custom')
    expect(result.current.dateRange).toEqual({ start: '2025-01-01', end: '2026-01-01' })
    expect(result.current.view.substituted).toBe('clamped')
  })

  it('leaves a 400-day range untouched on the wider 480-day Search Console ceiling', () => {
    window.sessionStorage.setItem(VIEW_RANGE_KEY, JSON.stringify({ start: '2024-11-28', end: '2026-01-01' }))
    const { result } = renderHook(() =>
      useUrlDateRange(opts('search', { maxDays: SEARCH_CONSOLE_MAX_DAYS })),
    )
    expect(result.current.period).toBe('custom')
    expect(result.current.dateRange).toEqual({ start: '2024-11-28', end: '2026-01-01' })
    expect(result.current.view.substituted).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// All time and realtime both disable the shift arrows.
// ---------------------------------------------------------------------------
describe('All time and realtime disable the shift arrows', () => {
  it('All time spans the whole data window and cannot be shifted', () => {
    const dataWindow: DataWindow = { from: '2026-03-01', through: '2026-09-20' }
    mockSearchParams = new URLSearchParams('period=all')
    const { result } = renderHook(() => useUrlDateRange(opts('dashboard', { window: dataWindow })))
    expect(result.current.period).toBe('all')
    expect(result.current.dateRange).toEqual({ start: '2026-03-01', end: '2026-09-20' })
    expect(result.current.picker.shiftBackDisabled).toBe(true)
    expect(result.current.picker.shiftForwardDisabled).toBe(true)
  })

  it('realtime cannot be shifted either', () => {
    mockSearchParams = new URLSearchParams('period=realtime')
    const { result } = renderHook(() => useUrlDateRange(opts('dashboard', { modes: ['realtime'] })))
    expect(result.current.period).toBe('realtime')
    expect(result.current.picker.shiftBackDisabled).toBe(true)
    expect(result.current.picker.shiftForwardDisabled).toBe(true)
  })
})

describe('the arrows stop at the edges of the data', () => {
  // Found by the 26-09 review: the forward arrow stopped only at today, so on Journeys
  // (newest day = yesterday) Yesterday → › asked for an empty Today, which the closest
  // view bounced straight back to Yesterday — a live-looking control that did nothing.
  it('forward is off when the view already ends on the page\'s newest day', () => {
    const journeys: DataWindow = { from: '2026-03-13', through: '2026-09-25' }
    mockSearchParams = new URLSearchParams('period=yesterday')
    const { result } = renderHook(() => useUrlDateRange(opts('journeys', { window: journeys })))
    expect(result.current.dateRange).toEqual({ start: '2026-09-25', end: '2026-09-25' })
    expect(result.current.picker.shiftForwardDisabled).toBe(true)
    expect(result.current.picker.shiftBackDisabled).toBe(false)
  })

  it('back is off when the view already starts on the page\'s first day', () => {
    const young: DataWindow = { from: '2026-09-20', through: '2026-09-26' }
    mockSearchParams = new URLSearchParams('period=7')
    const { result } = renderHook(() => useUrlDateRange(opts('dashboard', { window: young })))
    expect(result.current.dateRange.start).toBe('2026-09-20')
    expect(result.current.picker.shiftBackDisabled).toBe(true)
  })

  it('both are on inside the data, and with no window at all', () => {
    const w: DataWindow = { from: '2026-01-01', through: '2026-09-26' }
    mockSearchParams = new URLSearchParams('period=custom&start=2026-06-01&end=2026-06-07')
    const inside = renderHook(() => useUrlDateRange(opts('dashboard', { window: w }))).result.current.picker
    expect(inside.shiftBackDisabled).toBe(false)
    expect(inside.shiftForwardDisabled).toBe(false)
    const none = renderHook(() => useUrlDateRange(opts('dashboard', { window: null }))).result.current.picker
    expect(none.shiftBackDisabled).toBe(false)
    expect(none.shiftForwardDisabled).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// picker.rows — one menu: the same eleven PERIOD_PRESETS rows, same order,
// on every surface (only availability differs — tested in view.test.ts).
// ---------------------------------------------------------------------------
describe('picker.rows — the one-menu invariant', () => {
  it('lists all eleven PERIOD_PRESETS keys in their declared order, on every surface', () => {
    for (const surface of ['dashboard', 'search'] as const) {
      const { result } = renderHook(() => useUrlDateRange(opts(surface)))
      expect(result.current.picker.rows).toHaveLength(11)
      expect(result.current.picker.rows.map((r) => r.key)).toEqual(PERIOD_PRESETS.map((p) => p.key))
    }
  })
})

// ---------------------------------------------------------------------------
// requested — the whole token asked for (URL or memory), separate from
// whatever the applied view ends up being.
// ---------------------------------------------------------------------------
describe('requested', () => {
  it('carries the range for a custom request', () => {
    mockSearchParams = new URLSearchParams('period=custom&start=2026-01-01&end=2026-01-31')
    const { result } = renderHook(() => useUrlDateRange(opts('dashboard')))
    expect(result.current.requested).toEqual({ period: 'custom', range: { start: '2026-01-01', end: '2026-01-31' } })
  })

  it('carries only the token for a named request', () => {
    mockSearchParams = new URLSearchParams('period=today')
    const { result } = renderHook(() => useUrlDateRange(opts('dashboard')))
    expect(result.current.requested).toEqual({ period: 'today' })
  })
})

// ---------------------------------------------------------------------------
// Legacy URL grammar tokens (removed as MENU ROWS, kept as GRAMMAR — §12
// "Removed"): an old shared link still opens, and the trigger shows its
// dates, never the literal word "Custom".
// ---------------------------------------------------------------------------
describe('legacy URL grammar tokens still resolve', () => {
  it.each(['24h', '16m', 'last-quarter'] as const)(
    '%s opens without crashing and never labels itself "Custom"',
    (token) => {
      mockSearchParams = new URLSearchParams(`period=${token}`)
      const { result } = renderHook(() => useUrlDateRange(opts('dashboard')))
      expect(result.current.view.label).not.toContain('Custom')
      expect(result.current.view.label).not.toBe(CUSTOM_RANGE_LABEL)
      expect(result.current.dateRange.start).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(result.current.dateRange.end).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    },
  )
})
