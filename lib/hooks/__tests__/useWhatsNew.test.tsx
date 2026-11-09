// An open dashboard picks up a new What's new post without a reload: the hook reads the feed again every 15 minutes
// while the tab is visible, and when the tab is shown again after 5 minutes or more (never sooner).
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { SWRConfig } from 'swr'

const h = vi.hoisted(() => ({ calls: 0 }))
vi.mock('@/lib/auth/context', () => ({ useAuth: () => ({ user: { id: 'person-1' } }) }))
vi.mock('@/lib/api/whatsNew', () => ({
  getWhatsNew: vi.fn(async () => {
    h.calls++
    return { posts: [], unread_count: 0 }
  }),
  markWhatsNewSeen: vi.fn(),
}))

import { useWhatsNew } from '../useWhatsNew'

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
)

const tick = (ms: number) => act(async () => {
  await vi.advanceTimersByTimeAsync(ms)
})

describe('useWhatsNew', () => {
  beforeEach(() => {
    h.calls = 0
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads the feed again every 15 minutes while the tab is open', async () => {
    renderHook(() => useWhatsNew(), { wrapper })
    await tick(10)
    expect(h.calls).toBe(1)
    await tick(14 * 60_000)
    expect(h.calls).toBe(1)
    await tick(60_000)
    expect(h.calls).toBe(2)
  })

  it('reads it again when the tab is shown after 5 minutes, and not sooner', async () => {
    const show = () => act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    renderHook(() => useWhatsNew(), { wrapper })
    await tick(10)
    expect(h.calls).toBe(1)
    await tick(4 * 60_000)
    await show()
    await tick(10)
    expect(h.calls).toBe(1)
    await tick(60_000)
    await show()
    await tick(10)
    expect(h.calls).toBe(2)
  })
})
