import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useUrlDateRange } from '../useUrlDateRange'

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
  formatDate: (d: Date) => {
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  },
}))

beforeEach(() => {
  mockReplace.mockClear()
  mockSearchParams = new URLSearchParams()
  window.localStorage.clear()
})

describe('useUrlDateRange', () => {
  it('defaults to period 30 with its computed range', () => {
    const { result } = renderHook(() => useUrlDateRange())
    expect(result.current.period).toBe('30')
    expect(result.current.dateRange).toEqual({ start: 'start-30', end: 'end-30' })
  })

  it('reads a preset period from the URL', () => {
    mockSearchParams = new URLSearchParams('period=7')
    const { result } = renderHook(() => useUrlDateRange())
    expect(result.current.period).toBe('7')
    expect(result.current.dateRange).toEqual({ start: 'start-7', end: 'end-7' })
  })

  it('reads a custom range from the URL when valid', () => {
    mockSearchParams = new URLSearchParams('period=custom&start=2026-01-01&end=2026-01-31')
    const { result } = renderHook(() => useUrlDateRange())
    expect(result.current.period).toBe('custom')
    expect(result.current.dateRange).toEqual({ start: '2026-01-01', end: '2026-01-31' })
  })

  it('normalizes period=custom with missing or malformed dates to the default', () => {
    mockSearchParams = new URLSearchParams('period=custom')
    expect(renderHook(() => useUrlDateRange()).result.current.period).toBe('30')
    mockSearchParams = new URLSearchParams('period=custom&start=garbage&end=2026-01-31')
    expect(renderHook(() => useUrlDateRange()).result.current.period).toBe('30')
  })

  it('setPeriod custom writes period/start/end; presets strip them', () => {
    const { result } = renderHook(() => useUrlDateRange())
    act(() => {
      result.current.setPeriod('custom', { start: '2026-01-01', end: '2026-01-31' })
    })
    let calledWith = mockReplace.mock.calls[0][0] as string
    expect(calledWith).toContain('period=custom')
    expect(calledWith).toContain('start=2026-01-01')
    expect(calledWith).toContain('end=2026-01-31')

    mockSearchParams = new URLSearchParams('period=custom&start=2026-01-01&end=2026-01-31')
    const { result: r2 } = renderHook(() => useUrlDateRange())
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
    const { result } = renderHook(() => useUrlDateRange())
    act(() => {
      result.current.setPeriod('30')
    })
    const calledWith = mockReplace.mock.calls[0][0] as string
    expect(calledWith).not.toContain('period=')
  })

  it('shiftPeriod moves a custom range back by its own span', () => {
    mockSearchParams = new URLSearchParams('period=custom&start=2026-01-08&end=2026-01-14')
    const { result } = renderHook(() => useUrlDateRange())
    act(() => {
      result.current.shiftPeriod(-1)
    })
    const calledWith = mockReplace.mock.calls[0][0] as string
    expect(calledWith).toContain('start=2026-01-01')
    expect(calledWith).toContain('end=2026-01-07')
  })

  it('shiftPeriod forward clamps at today (no-op past it)', () => {
    mockSearchParams = new URLSearchParams('period=custom&start=2099-01-01&end=2099-01-07')
    const { result } = renderHook(() => useUrlDateRange())
    act(() => {
      result.current.shiftPeriod(1)
    })
    expect(mockReplace).not.toHaveBeenCalled()
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
      const r = useUrlDateRange()
      seen.push({ period: r.period, ready: r.periodReady })
      return r
    })
    return seen
  }

  it('is NOT ready on the render that reports the placeholder period', () => {
    window.localStorage.setItem('pulse_last_period', 'today')
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
    window.localStorage.setItem('pulse_last_period', 'today')
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
    const { result } = renderHook(() => useUrlDateRange())
    act(() => {
      result.current.setPeriod('7')
    })
    expect(window.localStorage.getItem('pulse_last_period')).toBe('7')

    // A fresh mount with no ?period= takes the remembered preset as the
    // effective default (state, not a URL write — a mount-time replace is
    // dropped during hydration on the prod build).
    mockReplace.mockClear()
    mockSearchParams = new URLSearchParams()
    const { result: r2 } = renderHook(() => useUrlDateRange())
    expect(r2.current.period).toBe('7')
    expect(r2.current.dateRange).toEqual({ start: 'start-7', end: 'end-7' })
  })

  it('picking the default period while another preset is remembered does not revert', () => {
    window.localStorage.setItem('pulse_last_period', '7')
    const { result } = renderHook(() => useUrlDateRange())
    expect(result.current.period).toBe('7')
    act(() => {
      result.current.setPeriod('30')
    })
    expect(result.current.period).toBe('30')
    expect(window.localStorage.getItem('pulse_last_period')).toBe('30')
  })

  it('an explicit URL period always wins over the memory', () => {
    window.localStorage.setItem('pulse_last_period', '7')
    mockSearchParams = new URLSearchParams('period=week')
    const { result } = renderHook(() => useUrlDateRange())
    expect(result.current.period).toBe('week')
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('custom ranges are NOT remembered — a frozen date span must never become the default', () => {
    window.localStorage.setItem('pulse_last_period', '7')
    const { result } = renderHook(() => useUrlDateRange())
    act(() => {
      result.current.setPeriod('custom', { start: '2026-01-01', end: '2026-01-31' })
    })
    expect(window.localStorage.getItem('pulse_last_period')).toBe('7')
  })

  it('garbage in storage never becomes the period', () => {
    window.localStorage.setItem('pulse_last_period', 'nonsense')
    mockSearchParams = new URLSearchParams()
    const { result } = renderHook(() => useUrlDateRange())
    expect(result.current.period).toBe('30')
  })
})
