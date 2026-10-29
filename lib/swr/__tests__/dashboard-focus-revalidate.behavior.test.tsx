import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { useDashboard } from '@/lib/swr/dashboard'
import type { DashboardData } from '@/lib/api/stats'

/**
 * PULSE-226 (a backgrounded tab does not catch up), behavioural half. The sibling
 * dashboard-focus-revalidate.test.ts proves we PASS `revalidateOnFocus: true`
 * and `focusThrottleInterval: 30_000` into useSWR; this file proves the REAL,
 * installed `swr` package (2.4.0 — see package.json) actually does what those
 * flags claim, against its own source:
 *
 *  - `revalidateOnFocus` subscribes to both the window `focus` event and the
 *    document `visibilitychange` event (node_modules/swr/dist/_internal's
 *    `initFocus`), and a matching event revalidates every mounted key whose
 *    own config has it on, gated by that key's own `focusThrottleInterval`
 *    (node_modules/swr/dist/index/index.mjs, the mount effect's
 *    `onRevalidate`'s `FOCUS_EVENT` arm).
 *  - the pre-existing `refreshInterval` tick SKIPS itself while
 *    `document.visibilityState === 'hidden'` (same file, the polling effect's
 *    `execute()`: `if (!getCache().error && (refreshWhenHidden ||
 *    getConfig().isVisible()) && ...)`), then just reschedules — it is not
 *    paused and caught up, it is silently skipped until the next full tick.
 *
 * `swr` itself is NOT mocked here (contrast the sibling file) — a mocked
 * `useSWR` cannot exercise either of these event listeners or timers.
 */

const fetchDashboard = vi.fn(async () => ({ marker: Date.now() }) as unknown as DashboardData)
vi.mock('@/lib/api/stats', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/api/stats')>()
  return {
    ...mod,
    getDashboard: (...args: unknown[]) => fetchDashboard(...(args as [])),
  }
})

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (hidden ? 'hidden' : 'visible'),
  })
}

function Probe({ minutes }: { minutes?: number }) {
  const { data } = useDashboard('site-1', '2026-10-01', '2026-10-01', 'hour', undefined, 'today', minutes)
  return <div data-testid="probe">{data ? 'loaded' : 'loading'}</div>
}

// A fresh cache per render — the same isolation full-list-null-key.test.tsx
// uses — so one test's key can never serve another's.
const isolated = (children: React.ReactNode) => (
  <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
)

describe('useDashboard focus revalidation (real swr, PULSE-226)', () => {
  beforeEach(() => {
    fetchDashboard.mockClear()
    setHidden(false)
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    setHidden(false)
  })

  it('a visibilitychange event after the 30s throttle triggers exactly one more fetch', async () => {
    render(isolated(<Probe />))
    await waitFor(() => expect(fetchDashboard).toHaveBeenCalledTimes(1))

    act(() => { vi.advanceTimersByTime(30_001) })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })

    await waitFor(() => expect(fetchDashboard).toHaveBeenCalledTimes(2))
  })

  it('a second visibilitychange inside the 30s throttle window triggers nothing more', async () => {
    render(isolated(<Probe />))
    await waitFor(() => expect(fetchDashboard).toHaveBeenCalledTimes(1))

    act(() => { vi.advanceTimersByTime(30_001) })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    await waitFor(() => expect(fetchDashboard).toHaveBeenCalledTimes(2))

    // 5s later is well inside the NEXT 30s throttle window (which restarted
    // at the fetch above) — must not fire again.
    act(() => { vi.advanceTimersByTime(5_000) })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    await act(async () => { await Promise.resolve() })

    expect(fetchDashboard).toHaveBeenCalledTimes(2)
  })

  it('a backgrounded tab gets no refreshInterval ticks while hidden', async () => {
    render(isolated(<Probe />))
    await waitFor(() => expect(fetchDashboard).toHaveBeenCalledTimes(1))

    setHidden(true)
    // One full 60s refreshInterval tick and then some, while hidden.
    act(() => { vi.advanceTimersByTime(90_000) })
    await act(async () => { await Promise.resolve() })

    expect(fetchDashboard).toHaveBeenCalledTimes(1)
  })

  it('the pre-existing 60s cadence still fires on its own while the tab stays visible (would have caught 6670cb3b)', async () => {
    render(isolated(<Probe />))
    await waitFor(() => expect(fetchDashboard).toHaveBeenCalledTimes(1))

    act(() => { vi.advanceTimersByTime(60_000) })
    await waitFor(() => expect(fetchDashboard).toHaveBeenCalledTimes(2))
  })

  it('live mode (minutes set) ignores visibilitychange — unchanged, it self-heals off the WebSocket', async () => {
    render(isolated(<Probe minutes={5} />))
    await waitFor(() => expect(fetchDashboard).toHaveBeenCalledTimes(1))

    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    await act(async () => { await Promise.resolve() })

    expect(fetchDashboard).toHaveBeenCalledTimes(1)
  })
})
