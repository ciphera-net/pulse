import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// Capture the KEY SWR is given. Asserting the arguments the hook is called
// with is not the same assertion: the arguments reach the fetcher, the key
// decides which cache entry the answer is filed under and served from.
// Named `swrSpy`, not `useSWR`: eslint's rules-of-hooks reads a `use*` call
// inside the mock factory as a hook invoked outside a component.
const swrSpy = vi.fn(() => ({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() }))
vi.mock('swr', () => ({ default: (...args: unknown[]) => swrSpy(...(args as [])) }))
vi.mock('swr/infinite', () => ({ default: vi.fn(() => ({ data: undefined, size: 0, setSize: vi.fn() })) }))

import { useCampaignsList } from '../dashboard'

const keyOf = () => swrSpy.mock.calls[swrSpy.mock.calls.length - 1][0] as unknown[]

beforeEach(() => swrSpy.mockClear())

describe('useCampaignsList cache key', () => {
  // 🔴 THE DEFECT CLASS THAT CAUSED THE 20-08-2026 REPORT. A card is handed
  // already-resolved dates, so the DATES are its identity. A key that omits
  // them files one range's rows under another range's entry — which is how a
  // customer was shown 30 days of campaigns under a "Today" label.
  it('includes the dates, so one range cannot be served for another', () => {
    renderHook(() => useCampaignsList('site-1', '2026-08-20', '2026-08-20', 10, undefined))
    const today = keyOf()
    renderHook(() => useCampaignsList('site-1', '2026-07-22', '2026-08-20', 10, undefined))
    const thirty = keyOf()

    expect(today).toContain('2026-08-20')
    expect(thirty).toContain('2026-07-22')
    expect(JSON.stringify(today)).not.toBe(JSON.stringify(thirty))
  })

  it('separates the card list from the view-all sheet by limit', () => {
    renderHook(() => useCampaignsList('site-1', '2026-08-20', '2026-08-20', 10, undefined))
    const card = JSON.stringify(keyOf())
    renderHook(() => useCampaignsList('site-1', '2026-08-20', '2026-08-20', 100, undefined))
    expect(JSON.stringify(keyOf())).not.toBe(card)
  })

  it('separates filtered from unfiltered', () => {
    renderHook(() => useCampaignsList('site-1', '2026-08-20', '2026-08-20', 10, undefined))
    const plain = JSON.stringify(keyOf())
    renderHook(() => useCampaignsList('site-1', '2026-08-20', '2026-08-20', 10, 'country==NL'))
    expect(JSON.stringify(keyOf())).not.toBe(plain)
  })

  it('is null while disabled, so the view-all sheet fires nothing until opened', () => {
    renderHook(() => useCampaignsList('site-1', '2026-08-20', '2026-08-20', 100, undefined, false))
    expect(keyOf()).toBeNull()
  })
})
