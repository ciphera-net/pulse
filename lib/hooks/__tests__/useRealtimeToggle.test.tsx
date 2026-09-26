import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useRealtimeToggle } from '../useRealtimeToggle'
import { DEFAULT_PERIOD, type Period } from '../periodUrl'
import type { RequestedView } from '@/lib/view/view'
import type { StoredView } from '../useUrlDateRange'

// * A fake of just the five UrlDateRange fields the hook's own Pick<> reads, so this test
// * never has to stand up the real hook's URL/storage machinery.
function fakeRange(opts: { period?: Period; requested?: RequestedView; remembered?: StoredView | null }) {
  const period: Period = opts.period ?? '30'
  const setPeriod = vi.fn()
  const restoreView = vi.fn()
  const range = {
    period,
    requested: opts.requested ?? { period },
    remembered: opts.remembered ?? null,
    setPeriod,
    restoreView,
  }
  return { range, setPeriod, restoreView }
}

describe('useRealtimeToggle — entering', () => {
  it('writes the URL period and touches nothing else', () => {
    const { range, setPeriod, restoreView } = fakeRange({ period: '7', requested: { period: '7' } })
    const { result } = renderHook(() => useRealtimeToggle(range))

    act(() => result.current.toggle())

    expect(setPeriod).toHaveBeenCalledTimes(1)
    expect(setPeriod).toHaveBeenCalledWith('realtime')
    expect(restoreView).not.toHaveBeenCalled()
  })
})

// ─── Leaving restores where the reader was — never a fresh pick ──────────────
//
// 🔴 This used to jump to DEFAULT_PERIOD unconditionally: somebody on "Last 7 days" who
// glanced at who was on the site came back to "Last 30 days". Checking the live view is
// a DETOUR, and a detour that silently rewrites where you were is a bug.
describe('useRealtimeToggle — leaving', () => {
  it('restores the view captured on entry, custom span included, and never re-calls setPeriod', () => {
    const requested: RequestedView = { period: 'custom', range: { start: '2026-09-01', end: '2026-09-15' } }
    const { range, setPeriod, restoreView } = fakeRange({ period: '30', requested, remembered: { period: '7' } })
    const { result, rerender } = renderHook((r) => useRealtimeToggle(r), { initialProps: range })

    act(() => result.current.toggle()) // enter: captures `requested` whole, span included
    expect(setPeriod).toHaveBeenCalledWith('realtime')

    // The URL now reflects realtime, the way a real navigation would after setPeriod.
    rerender({ ...range, period: 'realtime' })
    act(() => result.current.toggle()) // leave

    expect(restoreView).toHaveBeenCalledWith({ period: 'custom', range: requested.range })
    expect(setPeriod).toHaveBeenCalledTimes(1)
  })

  // * No session history: the hook mounted straight onto a live URL (a tab opened on
  // * ?period=realtime, or reloaded while live), so there is nothing captured to return
  // * to. The reader's own stored view is the closest honest answer.
  it('restores the remembered view when nothing was captured', () => {
    const { range, setPeriod, restoreView } = fakeRange({
      period: 'realtime',
      requested: { period: 'realtime' },
      remembered: { period: '7' },
    })
    const { result } = renderHook(() => useRealtimeToggle(range))

    act(() => result.current.toggle())

    expect(restoreView).toHaveBeenCalledWith({ period: '7' })
    expect(setPeriod).not.toHaveBeenCalled()
  })

  it('falls back to the default period when neither a session view nor a remembered one exists', () => {
    const { range, restoreView } = fakeRange({
      period: 'realtime',
      requested: { period: 'realtime' },
      remembered: null,
    })
    const { result } = renderHook(() => useRealtimeToggle(range))

    act(() => result.current.toggle())

    expect(restoreView).toHaveBeenCalledWith({ period: DEFAULT_PERIOD })
  })

  // * Defence in depth: a stored realtime is a bug elsewhere (realtime is declared a MODE
  // * precisely so it is never written to memory), but honouring it here too would trap
  // * the reader in the view they were trying to leave.
  it('refuses a remembered realtime and falls back to the default instead', () => {
    const { range, restoreView } = fakeRange({
      period: 'realtime',
      requested: { period: 'realtime' },
      remembered: { period: 'realtime' },
    })
    const { result } = renderHook(() => useRealtimeToggle(range))

    act(() => result.current.toggle())

    expect(restoreView).toHaveBeenCalledWith({ period: DEFAULT_PERIOD })
  })
})
