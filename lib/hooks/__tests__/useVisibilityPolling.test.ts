import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVisibilityPolling } from '../useVisibilityPolling'

describe('useVisibilityPolling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts polling and calls callback at the visible interval', () => {
    const callback = vi.fn()

    renderHook(() =>
      useVisibilityPolling(callback, {
        visibleInterval: 1000,
        hiddenInterval: null,
      })
    )

    // Initial call might not happen immediately; advance to trigger interval
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(callback).toHaveBeenCalled()
  })

  it('reports isPolling as true when active', () => {
    const callback = vi.fn()

    const { result } = renderHook(() =>
      useVisibilityPolling(callback, {
        visibleInterval: 1000,
        hiddenInterval: null,
      })
    )

    expect(result.current.isPolling).toBe(true)
  })

  it('calls callback multiple times over multiple intervals', () => {
    const callback = vi.fn()

    renderHook(() =>
      useVisibilityPolling(callback, {
        visibleInterval: 500,
        hiddenInterval: null,
      })
    )

    act(() => {
      vi.advanceTimersByTime(1500)
    })

    expect(callback.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('triggerPoll calls callback immediately', () => {
    const callback = vi.fn()

    const { result } = renderHook(() =>
      useVisibilityPolling(callback, {
        visibleInterval: 10000,
        hiddenInterval: null,
      })
    )

    act(() => {
      result.current.triggerPoll()
    })

    expect(callback).toHaveBeenCalled()
    expect(result.current.lastPollTime).not.toBeNull()
  })

  it('cleans up intervals on unmount', () => {
    const callback = vi.fn()

    const { unmount } = renderHook(() =>
      useVisibilityPolling(callback, {
        visibleInterval: 1000,
        hiddenInterval: null,
      })
    )

    unmount()
    callback.mockClear()

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(callback).not.toHaveBeenCalled()
  })
})
