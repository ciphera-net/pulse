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

// * Mock dateRanges to keep this unit test isolated from date helpers
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
    expect(result.current.lens).toBeNull()
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
    mockSearchParams = new URLSearchParams('depth=6&density=30&entry=%2F&lens=%2Flogin&view=flow')
    const { result } = renderHook(() => useJourneyFilters())
    act(() => {
      result.current.resetFilters()
    })
    const calledWith = mockReplace.mock.calls[0][0] as string
    expect(calledWith).not.toContain('depth=')
    expect(calledWith).not.toContain('density=')
    expect(calledWith).not.toContain('entry=')
    expect(calledWith).not.toContain('lens=')
    expect(calledWith).not.toContain('view=')
  })

  it('isDefault is false when any non-default value present', () => {
    mockSearchParams = new URLSearchParams('depth=6')
    const { result } = renderHook(() => useJourneyFilters())
    expect(result.current.isDefault).toBe(false)
  })

  it('reads lens from URL when present', () => {
    mockSearchParams = new URLSearchParams('lens=%2Flogin')
    const { result } = renderHook(() => useJourneyFilters())
    expect(result.current.lens).toBe('/login')
    expect(result.current.isDefault).toBe(false)
  })

  it('treats an empty lens param as null', () => {
    mockSearchParams = new URLSearchParams('lens=')
    const { result } = renderHook(() => useJourneyFilters())
    expect(result.current.lens).toBeNull()
    expect(result.current.isDefault).toBe(true)
  })

  it('setLens writes the path to the URL', () => {
    const { result } = renderHook(() => useJourneyFilters())
    act(() => {
      result.current.setLens('/login')
    })
    const calledWith = mockReplace.mock.calls[0][0] as string
    expect(calledWith).toContain('lens=%2Flogin')
  })

  it('setLens(null) strips the lens param', () => {
    mockSearchParams = new URLSearchParams('lens=%2Flogin&depth=6')
    const { result } = renderHook(() => useJourneyFilters())
    act(() => {
      result.current.setLens(null)
    })
    const calledWith = mockReplace.mock.calls[0][0] as string
    expect(calledWith).not.toContain('lens=')
    expect(calledWith).toContain('depth=6')
  })

  it('parses dimension filters from the URL codec (legacy, unprefixed)', () => {
    mockSearchParams = new URLSearchParams('filters=country%7Cis%7CUS')
    const { result } = renderHook(() => useJourneyFilters())
    expect(result.current.dimensionFilters).toEqual([
      { dimension: 'country', operator: 'is', values: ['US'] },
    ])
    // re-serialized for API calls in the versioned v2 format
    expect(result.current.filtersParam).toBe('v2:country|is|US')
    expect(result.current.isDefault).toBe(false)
  })

  it('has no dimension filters by default', () => {
    const { result } = renderHook(() => useJourneyFilters())
    expect(result.current.dimensionFilters).toEqual([])
    expect(result.current.filtersParam).toBe('')
  })

  it('setDimensionFilters serializes into the filters param', () => {
    const { result } = renderHook(() => useJourneyFilters())
    act(() => {
      result.current.setDimensionFilters([{ dimension: 'device', operator: 'is', values: ['mobile'] }])
    })
    const calledWith = mockReplace.mock.calls[0][0] as string
    expect(calledWith).toContain('filters=v2%3Adevice%7Cis%7Cmobile')
  })

  it('setDimensionFilters([]) strips the filters param', () => {
    mockSearchParams = new URLSearchParams('filters=device%7Cis%7Cmobile&depth=6')
    const { result } = renderHook(() => useJourneyFilters())
    act(() => {
      result.current.setDimensionFilters([])
    })
    const calledWith = mockReplace.mock.calls[0][0] as string
    expect(calledWith).not.toContain('filters=')
    expect(calledWith).toContain('depth=6')
  })

  it('resetFilters clears the filters param too', () => {
    mockSearchParams = new URLSearchParams('filters=country%7Cis%7CUS&depth=6')
    const { result } = renderHook(() => useJourneyFilters())
    act(() => {
      result.current.resetFilters()
    })
    const calledWith = mockReplace.mock.calls[0][0] as string
    expect(calledWith).not.toContain('filters=')
    expect(calledWith).not.toContain('depth=')
  })

  it('clamps depth on write when value exceeds max', () => {
    const { result } = renderHook(() => useJourneyFilters())
    act(() => {
      result.current.setDepth(999)
    })
    const calledWith = mockReplace.mock.calls[0][0] as string
    expect(calledWith).toContain('depth=6')
  })

  it('clamps density on write when value below min', () => {
    const { result } = renderHook(() => useJourneyFilters())
    act(() => {
      result.current.setDensity(-10)
    })
    const calledWith = mockReplace.mock.calls[0][0] as string
    expect(calledWith).toContain('density=5')
  })

  it('setPeriod with custom range writes start and end to URL', () => {
    const { result } = renderHook(() => useJourneyFilters())
    act(() => {
      result.current.setPeriod('custom', { start: '2026-01-01', end: '2026-01-31' })
    })
    const calledWith = mockReplace.mock.calls[0][0] as string
    expect(calledWith).toContain('period=custom')
    expect(calledWith).toContain('start=2026-01-01')
    expect(calledWith).toContain('end=2026-01-31')
  })

  it('switching away from custom period strips start and end from URL', () => {
    mockSearchParams = new URLSearchParams('period=custom&start=2026-01-01&end=2026-01-31')
    const { result } = renderHook(() => useJourneyFilters())
    act(() => {
      result.current.setPeriod('7')
    })
    const calledWith = mockReplace.mock.calls[0][0] as string
    expect(calledWith).toContain('period=7')
    expect(calledWith).not.toContain('start=')
    expect(calledWith).not.toContain('end=')
  })

  it('reads custom dateRange from URL when period=custom with valid start/end', () => {
    mockSearchParams = new URLSearchParams('period=custom&start=2026-01-01&end=2026-01-31')
    const { result } = renderHook(() => useJourneyFilters())
    expect(result.current.period).toBe('custom')
    expect(result.current.dateRange).toEqual({ start: '2026-01-01', end: '2026-01-31' })
  })

  it('normalizes period=custom to default when start/end missing', () => {
    mockSearchParams = new URLSearchParams('period=custom')
    const { result } = renderHook(() => useJourneyFilters())
    expect(result.current.period).toBe('30')
  })

  it('normalizes period=custom to default when start/end malformed', () => {
    mockSearchParams = new URLSearchParams('period=custom&start=nonsense&end=also-bad')
    const { result } = renderHook(() => useJourneyFilters())
    expect(result.current.period).toBe('30')
  })
})
