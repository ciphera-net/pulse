import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePendingKeys, whilePending } from '../pending'

/**
 * whilePending (PUL-28): a key is pending exactly as long as its action
 * waits, and is released only AFTER onCommitted has finished. Releasing it
 * before the refresh lands made a deleted item flash back into its list while
 * the refetch was in flight (found in review, 14-10-2026).
 */
const keys = () => renderHook(() => usePendingKeys())

describe('whilePending', () => {
  it('marks the key pending as soon as the action is wrapped', () => {
    const { result } = keys()
    act(() => { whilePending('site:a', { message: 'x', commit: vi.fn() }) })
    expect(result.current.has('site:a')).toBe(true)
  })

  it('releases the key only after onCommitted (and its refresh) resolves', async () => {
    const { result } = keys()
    let finishRefresh!: () => void
    const refresh = new Promise<void>((r) => { finishRefresh = r })
    let wrapped!: ReturnType<typeof whilePending>
    act(() => { wrapped = whilePending('site:b', { message: 'x', commit: vi.fn(), onCommitted: () => refresh }) })

    let done!: Promise<unknown>
    act(() => { done = Promise.resolve(wrapped.onCommitted?.(undefined)) })
    await act(async () => { await Promise.resolve() })
    // The refetch is still in flight: the item must stay hidden.
    expect(result.current.has('site:b')).toBe(true)

    await act(async () => { finishRefresh(); await done })
    expect(result.current.has('site:b')).toBe(false)
  })

  it('releases the key even when onCommitted throws', async () => {
    const { result } = keys()
    let wrapped!: ReturnType<typeof whilePending>
    act(() => { wrapped = whilePending('site:c', { message: 'x', commit: vi.fn(), onCommitted: () => Promise.reject(new Error('refetch failed')) }) })
    await act(async () => { await Promise.resolve(wrapped.onCommitted?.(undefined)).catch(() => {}) })
    expect(result.current.has('site:c')).toBe(false)
  })

  it('releases the key on Undo and on a failed request, calling the caller too', () => {
    const { result } = keys()
    const onUndo = vi.fn()
    const onError = vi.fn()
    let a!: ReturnType<typeof whilePending>
    let b!: ReturnType<typeof whilePending>
    act(() => {
      a = whilePending('k:undo', { message: 'x', commit: vi.fn(), onUndo })
      b = whilePending('k:error', { message: 'x', commit: vi.fn(), onError })
    })
    act(() => { a.onUndo?.() })
    act(() => { b.onError?.(new Error('409')) })
    expect(result.current.has('k:undo')).toBe(false)
    expect(result.current.has('k:error')).toBe(false)
    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(new Error('409'))
  })
})
