import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUrlDateRange, SEARCH_CONSOLE_MAX_DAYS, type PageRangeOptions } from '../useUrlDateRange'
import { previousDateRange } from '../periodUrl'
import type { PeriodPreset } from '@/lib/constants/periods'

// * Mock Next.js navigation
const mockReplace = vi.fn()
let mockSearchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/sites/abc/funnels',
}))

// * Real local-parts formatDate so shift math is exercised; range getters stubbed
vi.mock('@/lib/utils/dateRanges', () => ({
  getDateRange: (days: number) => ({ start: `start-${days}`, end: `end-${days}` }),
  getThisWeekRange: () => ({ start: 'week-start', end: 'week-end' }),
  getThisMonthRange: () => ({ start: 'month-start', end: 'month-end' }),
  // Completed 22-08-2026: the ceiling tests exercise EVERY preset, which
  // reaches range getters the original three-stub mock never called.
  getThisYearRange: () => ({ start: 'year-start', end: 'year-end' }),
  getYesterdayRange: () => ({ start: 'yday-start', end: 'yday-end' }),
  getQuarterToDateRange: () => ({ start: 'qtd-start', end: 'qtd-end' }),
  getLastWeekRange: () => ({ start: 'lweek-start', end: 'lweek-end' }),
  getLastMonthRange: () => ({ start: 'lmonth-start', end: 'lmonth-end' }),
  getLastQuarterRange: () => ({ start: 'lq-start', end: 'lq-end' }),
  getLastYearRange: () => ({ start: 'lyear-start', end: 'lyear-end' }),
  formatDate: (d: Date) => {
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  },
}))

// Every page passes its declaration since 22-08-2026 (per-page range memory).
// PAGE stands in for a plain analytics page: full global grammar, 366-day cap.
const PAGE: PageRangeOptions = { pageKey: 'page-a' }
const PAGE_KEY = 'pulse_last_period:page-a'
const LEGACY_SHARED_KEY = 'pulse_last_period'

const preset = (key: string): PeriodPreset => ({
  key,
  label: key,
  group: 'Test ranges',
  resolve: () => ({ start: `start-${key}`, end: `end-${key}` }),
})

beforeEach(() => {
  mockReplace.mockClear()
  mockSearchParams = new URLSearchParams()
  window.localStorage.clear()
})

describe('useUrlDateRange', () => {
  it('defaults to period 30 with its computed range', () => {
    const { result } = renderHook(() => useUrlDateRange(PAGE))
    expect(result.current.period).toBe('30')
    expect(result.current.dateRange).toEqual({ start: 'start-30', end: 'end-30' })
  })

  it('reads a preset period from the URL', () => {
    mockSearchParams = new URLSearchParams('period=7')
    const { result } = renderHook(() => useUrlDateRange(PAGE))
    expect(result.current.period).toBe('7')
    expect(result.current.dateRange).toEqual({ start: 'start-7', end: 'end-7' })
  })

  it('reads a custom range from the URL when valid', () => {
    mockSearchParams = new URLSearchParams('period=custom&start=2026-01-01&end=2026-01-31')
    const { result } = renderHook(() => useUrlDateRange(PAGE))
    expect(result.current.period).toBe('custom')
    expect(result.current.dateRange).toEqual({ start: '2026-01-01', end: '2026-01-31' })
  })

  it('normalizes period=custom with missing or malformed dates to the default', () => {
    mockSearchParams = new URLSearchParams('period=custom')
    expect(renderHook(() => useUrlDateRange(PAGE)).result.current.period).toBe('30')
    mockSearchParams = new URLSearchParams('period=custom&start=garbage&end=2026-01-31')
    expect(renderHook(() => useUrlDateRange(PAGE)).result.current.period).toBe('30')
  })

  it('setPeriod custom writes period/start/end; presets strip them', () => {
    const { result } = renderHook(() => useUrlDateRange(PAGE))
    act(() => {
      result.current.setPeriod('custom', { start: '2026-01-01', end: '2026-01-31' })
    })
    let calledWith = mockReplace.mock.calls[0][0] as string
    expect(calledWith).toContain('period=custom')
    expect(calledWith).toContain('start=2026-01-01')
    expect(calledWith).toContain('end=2026-01-31')

    mockSearchParams = new URLSearchParams('period=custom&start=2026-01-01&end=2026-01-31')
    const { result: r2 } = renderHook(() => useUrlDateRange(PAGE))
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
    const { result } = renderHook(() => useUrlDateRange(PAGE))
    act(() => {
      result.current.setPeriod('30')
    })
    const calledWith = mockReplace.mock.calls[0][0] as string
    expect(calledWith).not.toContain('period=')
  })

  it('shiftPeriod moves a custom range back by its own span', () => {
    mockSearchParams = new URLSearchParams('period=custom&start=2026-01-08&end=2026-01-14')
    const { result } = renderHook(() => useUrlDateRange(PAGE))
    act(() => {
      result.current.shiftPeriod(-1)
    })
    const calledWith = mockReplace.mock.calls[0][0] as string
    expect(calledWith).toContain('start=2026-01-01')
    expect(calledWith).toContain('end=2026-01-07')
  })

  it('shiftPeriod forward clamps at today (no-op past it)', () => {
    mockSearchParams = new URLSearchParams('period=custom&start=2099-01-01&end=2099-01-07')
    const { result } = renderHook(() => useUrlDateRange(PAGE))
    act(() => {
      result.current.shiftPeriod(1)
    })
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('hands the page declaration back as pickerProps — one source for menu and validation', () => {
    const extraPresets = { group: 'Test ranges', exclusive: true, presets: [preset('7'), preset('30')] }
    const { result } = renderHook(() =>
      useUrlDateRange({ pageKey: 'page-a', extraPresets }),
    )
    expect(result.current.pickerProps.extraPresets).toBe(extraPresets)

    const excludePresets = ['1h', '24h']
    const { result: r2 } = renderHook(() =>
      useUrlDateRange({ pageKey: 'page-a', excludePresets }),
    )
    expect(r2.current.pickerProps.excludePresets).toBe(excludePresets)
  })
})

// ---------------------------------------------------------------------------
// periodReady — the gate that stops a placeholder period reaching the network.
//
// 🔴 WHY THIS EXISTS. themodestyhouse.com, 20-08-2026: the Campaigns card
// showed `reddit` (last seen 9 days earlier) and `copilot.com` (6 days) while
// the range picker said "Today". Only a 30-DAY window contains both, and
// DEFAULT_PERIOD is '30'.
//
// The range memory is read in an effect (deliberately — a mount-time
// router.replace is dropped during hydration), so the first render of any
// bare-URL mount reports DEFAULT_PERIOD. That render is not free: it mints a
// real SWR cache entry for period=30d, and on the NEXT navigation to the page
// that entry is warm, so the dashboard resolves instantly to a 30-day range
// and every card renders 30 days of data before the period corrects.
// ---------------------------------------------------------------------------
describe('useUrlDateRange periodReady', () => {
  function renderTrace() {
    const seen: Array<{ period: string; ready: boolean }> = []
    renderHook(() => {
      const r = useUrlDateRange(PAGE)
      seen.push({ period: r.period, ready: r.periodReady })
      return r
    })
    return seen
  }

  it('is NOT ready on the render that reports the placeholder period', () => {
    window.localStorage.setItem(PAGE_KEY, 'today')
    const seen = renderTrace()

    // The first render still reports DEFAULT_PERIOD — that is required for
    // server and client to agree during hydration, and is not being changed.
    expect(seen[0].period).toBe('30')
    // What changes is that it now declares itself unresolved, so callers can
    // withhold the request instead of caching a 30-day answer.
    expect(seen[0].ready).toBe(false)

    const last = seen[seen.length - 1]
    expect(last.period).toBe('today')
    expect(last.ready).toBe(true)
  })

  it('never reports ready while showing the placeholder — the invariant', () => {
    window.localStorage.setItem(PAGE_KEY, 'today')
    const seen = renderTrace()
    expect(seen.filter(r => r.ready && r.period === '30')).toEqual([])
  })

  it('is ready on the FIRST render when the URL carries an explicit period', () => {
    mockSearchParams = new URLSearchParams('period=today')
    const seen = renderTrace()
    // Nothing to wait for: a shared link is authoritative immediately, so
    // this gate must cost those navigations nothing.
    expect(seen[0]).toEqual({ period: 'today', ready: true })
  })

  it('becomes ready when NOTHING is remembered', () => {
    // The paired negative. "No preset stored" and "storage not read yet" both
    // surface as null; collapsing them would leave a user who has never picked
    // a preset permanently un-ready, i.e. a dashboard that never loads.
    const seen = renderTrace()
    const last = seen[seen.length - 1]
    expect(last).toEqual({ period: '30', ready: true })
  })
})

describe('useUrlDateRange range memory', () => {
  it('remembers a chosen preset and applies it on a bare-URL mount', () => {
    const { result } = renderHook(() => useUrlDateRange(PAGE))
    act(() => {
      result.current.setPeriod('7')
    })
    expect(window.localStorage.getItem(PAGE_KEY)).toBe('7')

    // A fresh mount with no ?period= takes the remembered preset as the
    // effective default (state, not a URL write — a mount-time replace is
    // dropped during hydration on the prod build).
    mockReplace.mockClear()
    mockSearchParams = new URLSearchParams()
    const { result: r2 } = renderHook(() => useUrlDateRange(PAGE))
    expect(r2.current.period).toBe('7')
    expect(r2.current.dateRange).toEqual({ start: 'start-7', end: 'end-7' })
  })

  it('picking the default period while another preset is remembered does not revert', () => {
    window.localStorage.setItem(PAGE_KEY, '7')
    const { result } = renderHook(() => useUrlDateRange(PAGE))
    expect(result.current.period).toBe('7')
    act(() => {
      result.current.setPeriod('30')
    })
    expect(result.current.period).toBe('30')
    expect(window.localStorage.getItem(PAGE_KEY)).toBe('30')
  })

  it('an explicit URL period always wins over the memory', () => {
    window.localStorage.setItem(PAGE_KEY, '7')
    mockSearchParams = new URLSearchParams('period=week')
    const { result } = renderHook(() => useUrlDateRange(PAGE))
    expect(result.current.period).toBe('week')
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('custom ranges are NOT remembered — a frozen date span must never become the default', () => {
    window.localStorage.setItem(PAGE_KEY, '7')
    const { result } = renderHook(() => useUrlDateRange(PAGE))
    act(() => {
      result.current.setPeriod('custom', { start: '2026-01-01', end: '2026-01-31' })
    })
    expect(window.localStorage.getItem(PAGE_KEY)).toBe('7')
  })

  it('garbage in storage never becomes the period', () => {
    window.localStorage.setItem(PAGE_KEY, 'nonsense')
    mockSearchParams = new URLSearchParams()
    const { result } = renderHook(() => useUrlDateRange(PAGE))
    expect(result.current.period).toBe('30')
  })
})

// ---------------------------------------------------------------------------
// Per-page memory (owner decision 22-08-2026). The pre-existing SHARED key is
// the reported bug: "Today" picked on the dashboard followed the customer to
// Search and CDN, whose pickers deliberately do not offer "Today".
// ---------------------------------------------------------------------------
describe('per-page range memory (22-08-2026)', () => {
  it('a preset picked on one page never changes what another page shows', () => {
    const { result } = renderHook(() => useUrlDateRange(PAGE))
    act(() => {
      result.current.setPeriod('7')
    })

    const { result: other } = renderHook(() => useUrlDateRange({ pageKey: 'page-b' }))
    expect(other.current.period).toBe('30')
    expect(other.current.periodReady).toBe(true)
    expect(window.localStorage.getItem(PAGE_KEY)).toBe('7')
    expect(window.localStorage.getItem('pulse_last_period:page-b')).toBeNull()
  })

  it('pages declaring the same pageKey share memory — funnels list and detail are one instrument', () => {
    // The paired positive for the isolation above: same key ⇒ same memory.
    const { result } = renderHook(() => useUrlDateRange(PAGE))
    act(() => {
      result.current.setPeriod('7')
    })
    const { result: sibling } = renderHook(() => useUrlDateRange({ pageKey: 'page-a' }))
    expect(sibling.current.period).toBe('7')
  })

  it('the pre-22-08 shared key is never applied as a value — and is deleted on sight', () => {
    window.localStorage.setItem(LEGACY_SHARED_KEY, 'today')
    const { result } = renderHook(() => useUrlDateRange(PAGE))
    // Not seeded, not applied: per-page memory means no cross-page carryover,
    // including from the era when carryover was the behaviour.
    expect(result.current.period).toBe('30')
    expect(result.current.periodReady).toBe(true)
    expect(window.localStorage.getItem(LEGACY_SHARED_KEY)).toBeNull()
    expect(window.localStorage.getItem(PAGE_KEY)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// The applied grammar follows the page's declared vocabulary (22-08-2026).
// The picker always filtered its MENU by the declaration; nothing filtered
// what memory or a shared URL APPLIED, so "today" stuck on pages that cannot
// offer it. Same family as the 16m ceiling bug — this is the other half.
// ---------------------------------------------------------------------------
describe('page preset vocabulary — applied, not just offered', () => {
  // A Search-page-shaped declaration: exclusive provider vocabulary, 480-day cap.
  const SEARCH_LIKE: PageRangeOptions = {
    pageKey: 'search-like',
    maxDays: SEARCH_CONSOLE_MAX_DAYS,
    extraPresets: {
      group: 'Search ranges',
      exclusive: true,
      presets: ['7', '28', '30', '3m', '6m', '12m', '16m'].map(preset),
    },
  }

  it('an exclusive page drops a remembered period outside its vocabulary', () => {
    window.localStorage.setItem('pulse_last_period:search-like', 'today')
    const { result } = renderHook(() => useUrlDateRange(SEARCH_LIKE))
    expect(result.current.period).toBe('30')
    expect(result.current.periodReady).toBe(true)
  })

  it('an exclusive page drops a ?period= outside its vocabulary from a shared link', () => {
    mockSearchParams = new URLSearchParams('period=today')
    const { result } = renderHook(() => useUrlDateRange(SEARCH_LIKE))
    expect(result.current.period).toBe('30')
  })

  it('an exclusive page honours its own vocabulary — including 16m under the wider cap', () => {
    // The paired positive: "always fall back to 30" would pass everything above.
    window.localStorage.setItem('pulse_last_period:search-like', '16m')
    const { result } = renderHook(() => useUrlDateRange(SEARCH_LIKE))
    expect(result.current.period).toBe('16m')
  })

  it('custom stays usable on an exclusive page — it carries explicit dates', () => {
    mockSearchParams = new URLSearchParams('period=custom&start=2026-01-01&end=2026-01-31')
    const { result } = renderHook(() => useUrlDateRange(SEARCH_LIKE))
    expect(result.current.period).toBe('custom')
    expect(result.current.dateRange).toEqual({ start: '2026-01-01', end: '2026-01-31' })
  })

  it('excludePresets removes those keys from the applied grammar, not just the menu', () => {
    const FUNNELS_LIKE: PageRangeOptions = { pageKey: 'funnels-like', excludePresets: ['1h', '24h'] }
    mockSearchParams = new URLSearchParams('period=24h')
    expect(renderHook(() => useUrlDateRange(FUNNELS_LIKE)).result.current.period).toBe('30')

    mockSearchParams = new URLSearchParams()
    window.localStorage.setItem('pulse_last_period:funnels-like', '24h')
    expect(renderHook(() => useUrlDateRange(FUNNELS_LIKE)).result.current.period).toBe('30')

    // Paired positive: a non-excluded global preset still applies.
    window.localStorage.clear()
    mockSearchParams = new URLSearchParams('period=today')
    expect(renderHook(() => useUrlDateRange(FUNNELS_LIKE)).result.current.period).toBe('today')
  })

  it('a NON-exclusive page still honours URL-grammar periods its menu does not list', () => {
    // Deliberate looseness: ?period=3m shared from Search opens on the
    // dashboard as the 90-day range it names (within the ceiling) — the menu
    // not offering a shortcut is not the same as the API refusing the range.
    mockSearchParams = new URLSearchParams('period=3m')
    const { result } = renderHook(() => useUrlDateRange(PAGE))
    expect(result.current.period).toBe('3m')
  })

  it('setPeriod refuses to remember a period outside the vocabulary', () => {
    const FUNNELS_LIKE: PageRangeOptions = { pageKey: 'funnels-like', excludePresets: ['1h', '24h'] }
    const { result } = renderHook(() => useUrlDateRange(FUNNELS_LIKE))
    act(() => {
      result.current.setPeriod('24h')
    })
    expect(window.localStorage.getItem('pulse_last_period:funnels-like')).toBeNull()
  })

  it('a declaration without the default period fails loud in dev', () => {
    // The silent fallback IS the default — a vocabulary excluding it would
    // fall back to a period the page does not offer.
    expect(() =>
      renderHook(() =>
        useUrlDateRange({
          pageKey: 'broken',
          extraPresets: { group: 'X', exclusive: true, presets: [preset('7')] },
        }),
      ),
    ).toThrow(/DEFAULT_PERIOD/)
  })
})

// ---------------------------------------------------------------------------
// previousDateRange must REJECT an unparseable range.
//
// 🔴 MEASURED ON STAGING 20-08-2026. Once the date-ranged pages began
// withholding their range while the remembered period resolved (#326,
// fetchableRange returns empty strings), /funnels issued a real request with
// `startDate=NaN-NaN-NaN&endDate=NaN-NaN-NaN`.
//
// The cause is a guard that cannot fail: both existing checks are `>` and `<`
// comparisons, and EVERY comparison with NaN is false, so an Invalid Date
// passed straight through and formatDate produced "NaN-NaN-NaN". That string
// is non-empty, so callers guarding on `prevRange?.start ?? ''` treated it as
// a usable date.
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

  // The paired positive: "always null" would pass every case above and
  // silently delete every period-over-period comparison in the product.
  it('still computes the preceding window for a real range', () => {
    expect(previousDateRange({ start: '2026-08-20', end: '2026-08-20' }))
      .toEqual({ start: '2026-08-19', end: '2026-08-19' })
    expect(previousDateRange({ start: '2026-08-14', end: '2026-08-20' }))
      .toEqual({ start: '2026-08-07', end: '2026-08-13' })
  })

  // Never a NaN-shaped string, whatever the input — the property that actually
  // reached the network.
  it('never returns a NaN-shaped date', () => {
    for (const r of [{ start: '', end: '' }, { start: 'x', end: 'y' }, { start: '2026-08-20', end: '' }]) {
      const out = previousDateRange(r)
      expect(out === null || (!out.start.includes('NaN') && !out.end.includes('NaN'))).toBe(true)
    }
  })
})

describe('per-page range ceiling (the 22-08-2026 dashboard outage)', () => {
  // A customer picked "Last 16 months" on Search (Google retains ~480 days),
  // then opened the Dashboard. The preset was remembered ACROSS pages, the
  // analytics API refuses > 366 days, and every card 400'd behind a
  // "Couldn't load the dashboard" screen. These pin both halves of the fix.
  // (Per-page memory has since removed the cross-page path, but a page's own
  // memory must still respect a ceiling that tightens in a future deploy.)

  it('drops a remembered preset the page\'s API cannot serve', () => {
    window.localStorage.setItem(PAGE_KEY, '16m')
    const { result } = renderHook(() => useUrlDateRange(PAGE))
    // Falls back to the default rather than sending a 480-day request.
    expect(result.current.period).toBe('30')
    expect(result.current.periodReady).toBe(true)
  })

  it('honours that same preset on a page that opts into the wider ceiling', () => {
    // The paired positive — without it, "always fall back to 30" would pass.
    window.localStorage.setItem(PAGE_KEY, '16m')
    const { result } = renderHook(() => useUrlDateRange({ pageKey: 'page-a', maxDays: SEARCH_CONSOLE_MAX_DAYS }))
    expect(result.current.period).toBe('16m')
  })

  it('clamps an over-long ?period= from a shared link too', () => {
    // A link shared from Search opened on an analytics page would 400 exactly
    // like the remembered preset did.
    mockSearchParams = new URLSearchParams('period=16m')
    const { result } = renderHook(() => useUrlDateRange(PAGE))
    expect(result.current.period).toBe('30')
  })

  it('leaves every in-ceiling preset untouched', () => {
    for (const p of ['today', 'yesterday', '7', '28', '30', '3m', '6m', '12m', 'week', 'month', 'qtd', 'year', 'last-week', 'last-month', 'last-quarter', 'last-year'] as const) {
      window.localStorage.clear()
      window.localStorage.setItem(PAGE_KEY, p)
      const { result } = renderHook(() => useUrlDateRange(PAGE))
      expect(result.current.period, `${p} must survive the 366-day ceiling`).toBe(p)
    }
  })
})
