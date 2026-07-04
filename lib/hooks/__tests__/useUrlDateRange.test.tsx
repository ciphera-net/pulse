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
