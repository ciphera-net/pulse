import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// PULSE-192: the lists a dashboard card fetches on its own must describe realtime
// mode's rolling window, refresh with it, and never share a cache entry with a dated
// view. 🔴 A live list keyed on its dates would share Today's entry (both are today's
// date), and each mode would be served the other's rows across a switch.
//
// The KEY is captured (it decides which cache entry an answer is filed under), and the
// FETCHER SWR was handed is invoked against mocked API functions (it decides what goes
// on the wire).

const swrSpy = vi.fn((..._args: unknown[]) => ({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() }))
vi.mock('swr', () => ({ default: (...args: unknown[]) => swrSpy(...args) }))
vi.mock('swr/infinite', () => ({ default: vi.fn(() => ({ data: undefined, size: 0, setSize: vi.fn() })) }))

const api = vi.hoisted(() => ({
  getCountries: vi.fn(async () => []),
  getCampaigns: vi.fn(async () => []),
  getEventPropertyValues: vi.fn(async () => []),
}))
vi.mock('@/lib/api/stats', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/api/stats')>()
  return { ...mod, ...api }
})

import { useFullDimensionList, useOutboundLinks, useCampaignsList, isLiveListKey, LIVE_LIST_KEY } from '../dashboard'

const lastCall = () => swrSpy.mock.calls[swrSpy.mock.calls.length - 1]
const keyOf = () => lastCall()[0] as unknown[] | null
const fetcherOf = () => lastCall()[1] as () => Promise<unknown>
const configOf = () => lastCall()[2] as { refreshInterval?: number; dedupingInterval?: number }

beforeEach(() => {
  swrSpy.mockClear()
  Object.values(api).forEach(f => f.mockClear())
})

describe('useFullDimensionList in realtime mode (PULSE-192)', () => {
  it('keys a live list on the window, never on the dates, so it cannot share Today\'s entry', () => {
    renderHook(() => useFullDimensionList('countries', 'site-1', '2026-10-01', '2026-10-01', 250, undefined, 5))
    const live = keyOf()
    renderHook(() => useFullDimensionList('countries', 'site-1', '2026-10-01', '2026-10-01', 250, undefined))
    const today = keyOf()

    expect(live).toContain(LIVE_LIST_KEY)
    expect(live).toContain(5)
    expect(live).not.toContain('2026-10-01')
    expect(JSON.stringify(live)).not.toBe(JSON.stringify(today))
    expect(today).toContain('2026-10-01')
  })

  it('fetches the live window, not the dates', async () => {
    renderHook(() => useFullDimensionList('countries', 'site-1', '2026-10-01', '2026-10-01', 250, 'v2:os|is|iOS', 5))
    await fetcherOf()()
    expect(api.getCountries).toHaveBeenCalledWith('site-1', '2026-10-01', '2026-10-01', 250, 'v2:os|is|iOS', undefined, 5)
  })

  it('refreshes at the dashboard fan-out\'s live cadence', () => {
    renderHook(() => useFullDimensionList('countries', 'site-1', '2026-10-01', '2026-10-01', 250, undefined, 5))
    expect(configOf().refreshInterval).toBe(15_000)
    expect(configOf().dedupingInterval).toBe(2_000)
  })

  it('still fetches nothing for a null kind (the frozen-blocks contract)', () => {
    renderHook(() => useFullDimensionList(null, 'site-1', '2026-10-01', '2026-10-01', 250, undefined, 5))
    expect(keyOf()).toBeNull()
  })
})

describe('useOutboundLinks in realtime mode (PULSE-192)', () => {
  it('keys on the window and fetches both lists with minutes and no period', async () => {
    renderHook(() => useOutboundLinks('site-1', '2026-10-01', '2026-10-01', 'today', 5))
    const live = keyOf()
    expect(live).toContain(LIVE_LIST_KEY)
    expect(live).not.toContain('2026-10-01')
    await fetcherOf()()
    expect(api.getEventPropertyValues).toHaveBeenCalledWith('site-1', 'outbound_link', 'url', '2026-10-01', '2026-10-01', 1000, undefined, 5)
    expect(api.getEventPropertyValues).toHaveBeenCalledWith('site-1', 'outbound_link', 'page_path', '2026-10-01', '2026-10-01', 1000, undefined, 5)
    expect(configOf().refreshInterval).toBe(15_000)
  })

  it('is unchanged without a live window', async () => {
    renderHook(() => useOutboundLinks('site-1', '2026-10-01', '2026-10-01', 'today'))
    expect(keyOf()).toEqual(['outbound', 'site-1', '2026-10-01', '2026-10-01', 'today'])
    await fetcherOf()()
    expect(api.getEventPropertyValues).toHaveBeenCalledWith('site-1', 'outbound_link', 'url', '2026-10-01', '2026-10-01', 1000, 'today', undefined)
    expect(configOf().refreshInterval).toBe(60_000)
  })
})

describe('useCampaignsList in realtime mode (PULSE-192)', () => {
  it('keys on the window and fetches with minutes and no period', async () => {
    renderHook(() => useCampaignsList('site-1', '2026-10-01', '2026-10-01', 10, undefined, true, undefined, 5))
    expect(keyOf()).toContain(LIVE_LIST_KEY)
    expect(keyOf()).not.toContain('2026-10-01')
    await fetcherOf()()
    expect(api.getCampaigns).toHaveBeenCalledWith('site-1', '2026-10-01', '2026-10-01', 10, undefined, undefined, 5)
  })

  it('stays disarmed when the view is not open', () => {
    renderHook(() => useCampaignsList('site-1', '2026-10-01', '2026-10-01', 10, undefined, false, undefined, 5))
    expect(keyOf()).toBeNull()
  })
})

describe('isLiveListKey: what the page revalidates on its live signal', () => {
  it('matches every live list of the site, and nothing dated or foreign', () => {
    const match = isLiveListKey('site-1')
    expect(match(['fullList', 'countries', 'site-1', LIVE_LIST_KEY, 5, 250, undefined])).toBe(true)
    expect(match(['outbound', 'site-1', LIVE_LIST_KEY, 5])).toBe(true)
    expect(match(['campaignsList', 'site-1', LIVE_LIST_KEY, 5, 10, undefined])).toBe(true)
    expect(match(['fullList', 'countries', 'site-1', '2026-10-01', '2026-10-01', 250, undefined])).toBe(false)
    expect(match(['fullList', 'countries', 'site-2', LIVE_LIST_KEY, 5, 250, undefined])).toBe(false)
    expect(match(['dashboard', 'site-1', '', '2026-10-01', '2026-10-01', 'minute', undefined, 5])).toBe(false)
    expect(match('fullList')).toBe(false)
  })
})
