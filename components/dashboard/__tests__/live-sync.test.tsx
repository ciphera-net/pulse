import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { PollLiveSync, SocketLiveSync } from '@/components/dashboard/LiveSync'
import { PUBLIC_LIVE_POLL_MS } from '@/lib/dashboard/realtimeRange'

// The two ways a live dashboard learns there is something new (PUL-34 Phase 2): a member's
// page by the realtime socket, a public page (which holds none) by one coordinated timer.

const sync = vi.hoisted(() => ({ useRealtimeSync: vi.fn() }))
vi.mock('@/lib/hooks/useRealtimeSync', () => ({ useRealtimeSync: (...a: unknown[]) => sync.useRealtimeSync(...a) }))

beforeEach(() => {
  vi.useFakeTimers()
  sync.useRealtimeSync.mockClear()
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
})
afterEach(() => {
  vi.useRealTimers()
})

describe('SocketLiveSync', () => {
  it('opens the realtime socket for the site, and nothing else', () => {
    const onChanged = vi.fn()
    render(<SocketLiveSync siteId="site-1" onChanged={onChanged} />)
    expect(sync.useRealtimeSync).toHaveBeenCalledWith({ enabled: true, siteId: 'site-1', onChanged })
    act(() => vi.advanceTimersByTime(10 * PUBLIC_LIVE_POLL_MS))
    expect(onChanged).not.toHaveBeenCalled()
  })
})

describe('PollLiveSync', () => {
  it('never touches the socket hook', () => {
    render(<PollLiveSync onChanged={() => {}} />)
    expect(sync.useRealtimeSync).not.toHaveBeenCalled()
  })

  it('refreshes every 15 seconds, and not before', () => {
    const onChanged = vi.fn()
    render(<PollLiveSync onChanged={onChanged} />)
    act(() => vi.advanceTimersByTime(PUBLIC_LIVE_POLL_MS - 1))
    expect(onChanged).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onChanged).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(PUBLIC_LIVE_POLL_MS))
    expect(onChanged).toHaveBeenCalledTimes(2)
  })

  it('is 15 seconds: the cadence the live fan-out already keeps as its backstop', () => {
    expect(PUBLIC_LIVE_POLL_MS).toBe(15_000)
  })

  it('calls the LATEST callback without restarting its clock when the page re-renders', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = render(<PollLiveSync onChanged={first} />)
    act(() => vi.advanceTimersByTime(10_000))
    rerender(<PollLiveSync onChanged={second} />)
    // 5 more seconds finish the ORIGINAL interval; a restarted timer would still be 10 s away.
    act(() => vi.advanceTimersByTime(5_000))
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('skips a tick while the tab is hidden, and catches up on the next visible one', () => {
    const onChanged = vi.fn()
    render(<PollLiveSync onChanged={onChanged} />)
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    act(() => vi.advanceTimersByTime(2 * PUBLIC_LIVE_POLL_MS))
    expect(onChanged).not.toHaveBeenCalled()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    act(() => vi.advanceTimersByTime(PUBLIC_LIVE_POLL_MS))
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('stops when it unmounts, which is when the page leaves realtime', () => {
    const onChanged = vi.fn()
    const { unmount } = render(<PollLiveSync onChanged={onChanged} />)
    unmount()
    act(() => vi.advanceTimersByTime(10 * PUBLIC_LIVE_POLL_MS))
    expect(onChanged).not.toHaveBeenCalled()
  })
})
