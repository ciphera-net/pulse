import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useJourneyFilters } from '../useJourneyFilters'

// * Mock Next.js navigation
const mockReplace = vi.fn()
let mockSearchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/sites/abc/journeys',
}))

// * Mock dateRanges to avoid pulling in @ciphera-net/ui CJS bundle
vi.mock('@/lib/utils/dateRanges', () => ({
  getDateRange: (days: number) => ({
    start: `start-${days}`,
    end: `end-${days}`,
  }),
  getThisWeekRange: () => ({ start: 'week-start', end: 'week-end' }),
  getThisMonthRange: () => ({ start: 'month-start', end: 'month-end' }),
  formatDate: (_d: Date) => 'today',
}))

beforeEach(() => {
  mockReplace.mockClear()
  mockSearchParams = new URLSearchParams()
})

describe('useJourneyFilters', () => {
  it('returns default values when URL has no params', () => {
    const { result } = renderHook(() => useJourneyFilters())
    expect(result.current.depth).toBe(4)
    expect(result.current.density).toBe(20)
    expect(result.current.entryPath).toBe('')
    expect(result.current.viewMode).toBe('columns')
    expect(result.current.period).toBe('30')
    expect(result.current.isDefault).toBe(true)
  })

  it('reads depth from URL when present', () => {
    mockSearchParams = new URLSearchParams('depth=6')
    const { result } = renderHook(() => useJourneyFilters())
    expect(result.current.depth).toBe(6)
  })

  it('clamps depth above 6 to 6', () => {
    mockSearchParams = new URLSearchParams('depth=99')
    const { result } = renderHook(() => useJourneyFilters())
    expect(result.current.depth).toBe(6)
  })

  it('clamps depth below 2 to 2', () => {
    mockSearchParams = new URLSearchParams('depth=1')
    const { result } = renderHook(() => useJourneyFilters())
    expect(result.current.depth).toBe(2)
  })

  it('falls back to default when depth is not numeric', () => {
    mockSearchParams = new URLSearchParams('depth=abc')
    const { result } = renderHook(() => useJourneyFilters())
    expect(result.current.depth).toBe(4)
  })

  it('clamps density to valid range', () => {
    mockSearchParams = new URLSearchParams('density=9999')
    const { result } = renderHook(() => useJourneyFilters())
    expect(result.current.density).toBe(50)
  })

  it('falls back to default for unknown viewMode', () => {
    mockSearchParams = new URLSearchParams('view=garbage')
    const { result } = renderHook(() => useJourneyFilters())
    expect(result.current.viewMode).toBe('columns')
  })

  it('reads valid viewMode from URL', () => {
    mockSearchParams = new URLSearchParams('view=flow')
    const { result } = renderHook(() => useJourneyFilters())
    expect(result.current.viewMode).toBe('flow')
  })

  it('setDepth calls router.replace with new URL', () => {
    const { result } = renderHook(() => useJourneyFilters())
    act(() => {
      result.current.setDepth(5)
    })
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('depth=5'),
      expect.objectContaining({ scroll: false }),
    )
  })

  it('setDepth omits default values from URL', () => {
    mockSearchParams = new URLSearchParams('depth=6&density=30')
    const { result } = renderHook(() => useJourneyFilters())
    act(() => {
      result.current.setDepth(4) // default
    })
    const calledWith = mockReplace.mock.calls[0][0] as string
    expect(calledWith).not.toContain('depth=')
    expect(calledWith).toContain('density=30')
  })

  it('resetFilters clears all filter params', () => {
    mockSearchParams = new URLSearchParams('depth=6&density=30&entry=%2F&view=flow')
    const { result } = renderHook(() => useJourneyFilters())
    act(() => {
      result.current.resetFilters()
    })
    const calledWith = mockReplace.mock.calls[0][0] as string
    expect(calledWith).not.toContain('depth=')
    expect(calledWith).not.toContain('density=')
    expect(calledWith).not.toContain('entry=')
    expect(calledWith).not.toContain('view=')
  })

  it('isDefault is false when any non-default value present', () => {
    mockSearchParams = new URLSearchParams('depth=6')
    const { result } = renderHook(() => useJourneyFilters())
    expect(result.current.isDefault).toBe(false)
  })
})
