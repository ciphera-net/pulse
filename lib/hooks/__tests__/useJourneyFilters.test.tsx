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

  it('reads lens from URL when present', () => {
    mockSearchParams = new URLSearchParams('lens=%2Flogin')
    const { result } = renderHook(() => useJourneyFilters())
    expect(result.current.lens).toBe('/login')
  })

  it('treats an empty lens param as null', () => {
    mockSearchParams = new URLSearchParams('lens=')
    const { result } = renderHook(() => useJourneyFilters())
    expect(result.current.lens).toBeNull()
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

  it('derives entryPath from an entry_path filter and keeps it OUT of filtersParam', () => {
    mockSearchParams = new URLSearchParams('filters=v2%3Aentry_path%7Cis%7C%2Fblog%2Cdevice%7Cis%7Cmobile')
    const { result } = renderHook(() => useJourneyFilters())
    expect(result.current.entryPath).toBe('/blog')
    expect(result.current.dimensionFilters.map((f) => f.dimension)).toEqual(['entry_path', 'device'])
    expect(result.current.filtersParam).not.toContain('entry_path')
    expect(result.current.filtersParam).toContain('device')
  })

  it('reads a pre-07-09 entry= link as an entry_path filter and rewrites it on the next write', () => {
    mockSearchParams = new URLSearchParams('entry=%2Fpricing')
    const { result } = renderHook(() => useJourneyFilters())
    expect(result.current.entryPath).toBe('/pricing')
    expect(result.current.dimensionFilters[0]).toEqual({ dimension: 'entry_path', operator: 'is', values: ['/pricing'] })
    act(() => {
      result.current.setDimensionFilters(result.current.dimensionFilters)
    })
    const calledWith = mockReplace.mock.calls[0][0] as string
    expect(calledWith).toContain('filters=')
    expect(calledWith).not.toContain('entry=')
  })

  it('snaps a legacy density to the ladder', () => {
    mockSearchParams = new URLSearchParams('density=30')
    const { result } = renderHook(() => useJourneyFilters())
    expect(result.current.density).toBe(20)
  })

  describe('memory', () => {
    beforeEach(() => {
      window.localStorage.clear()
    })

    it('remembers depth and paths across visits when the URL carries none', () => {
      window.localStorage.setItem('pulse_last_journeys:depth', '6')
      window.localStorage.setItem('pulse_last_journeys:density', '50')
      // ready is gated on the memory read alone now (PULSE-20 took the period —
      // and its timezone gate — off this hook entirely; see useUrlDateRange).
      const { result } = renderHook(() => useJourneyFilters())
      expect(result.current.ready).toBe(true)
      expect(result.current.depth).toBe(6)
      expect(result.current.density).toBe(50)
    })

    it('the URL wins over memory', () => {
      window.localStorage.setItem('pulse_last_journeys:depth', '6')
      mockSearchParams = new URLSearchParams('depth=3')
      const { result } = renderHook(() => useJourneyFilters())
      expect(result.current.depth).toBe(3)
    })

    it('ignores garbage in storage', () => {
      window.localStorage.setItem('pulse_last_journeys:depth', '99')
      window.localStorage.setItem('pulse_last_journeys:density', 'lots')
      const { result } = renderHook(() => useJourneyFilters())
      expect(result.current.depth).toBe(4)
      expect(result.current.density).toBe(20)
    })

    it('writes depth and paths on change', () => {
      const { result } = renderHook(() => useJourneyFilters())
      act(() => { result.current.setDepth(5) })
      act(() => { result.current.setDensity(10) })
      expect(window.localStorage.getItem('pulse_last_journeys:depth')).toBe('5')
      expect(window.localStorage.getItem('pulse_last_journeys:density')).toBe('10')
    })
  })

  // ---------------------------------------------------------------------------
  // PULSE-20 (25-09-2026): the period moved to useUrlDateRange, under the ONE
  // view memory ('pulse_view' / 'pulse_view_range'). Journeys' own period state
  // — its private `pulse_last_period:journeys` key, parsePeriod, periodToDateRange
  // and readiness — is GONE. This is the one test that stands in for all of the
  // removed period/dateRange/siteNow/shiftPeriod/timezone coverage: it proves
  // the surface is gone, not merely unused, and that nothing here still touches
  // a period-shaped storage key (this hook's own DEPTH_KEY/DENSITY_KEY are
  // page-local and untouched by this check — see design §11.13 item 3).
  // ---------------------------------------------------------------------------
  describe('no period API (PULSE-20 — the period moved to useUrlDateRange)', () => {
    it('exposes no period surface and never touches a pulse_last_period* or pulse_view* storage key', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem')

      const { result } = renderHook(() => useJourneyFilters())

      expect(result.current).not.toHaveProperty('period')
      expect(result.current).not.toHaveProperty('dateRange')
      expect(result.current).not.toHaveProperty('requestedPeriod')
      expect(result.current).not.toHaveProperty('setPeriod')
      expect(result.current).not.toHaveProperty('shiftPeriod')
      expect(result.current).not.toHaveProperty('siteNow')
      expect(result.current).not.toHaveProperty('timezone')
      expect(result.current).not.toHaveProperty('picker')

      act(() => { result.current.setDepth(6) })
      act(() => { result.current.setDensity(50) })
      act(() => { result.current.setLens('/login') })
      act(() => {
        result.current.setDimensionFilters([{ dimension: 'device', operator: 'is', values: ['mobile'] }])
      })

      const touchedKeys = [...setItemSpy.mock.calls, ...getItemSpy.mock.calls].map((c) => String(c[0]))
      for (const key of touchedKeys) {
        expect(key.startsWith('pulse_last_period')).toBe(false)
        expect(key.startsWith('pulse_view')).toBe(false)
      }

      setItemSpy.mockRestore()
      getItemSpy.mockRestore()
    })
  })
})
