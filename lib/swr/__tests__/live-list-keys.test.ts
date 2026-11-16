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
  getEventPropertyKeys: vi.fn(async () => []),
  getEventPropertyValues: vi.fn(async () => []),
}))
vi.mock('@/lib/api/stats', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/api/stats')>()
  return { ...mod, ...api }
})

import { useFullDimensionList, useCampaignsList, useEventPropertyKeys, useEventPropertyValues, useOutboundUrls, isLiveListKey, LIVE_LIST_KEY } from '../dashboard'

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

// The Events block's pane in the new frame: an event's keys and one key's values, under the page's filters.
describe('useEventPropertyKeys and useEventPropertyValues: the page\'s filters, and the live window', () => {
  const F = 'v2:device|is|mobile'

  it('key a dated read on the event, the dates, the period and the filters, and send the filters', async () => {
    renderHook(() => useEventPropertyKeys('site-1', 'signup', '2026-10-01', '2026-10-07', F))
    expect(keyOf()).toEqual(['eventKeys', 'site-1', 'signup', '2026-10-01', '2026-10-07', '', F])
    await fetcherOf()()
    expect(api.getEventPropertyKeys).toHaveBeenCalledWith('site-1', 'signup', '2026-10-01', '2026-10-07', undefined, F, undefined)
    expect(configOf().refreshInterval).toBeUndefined()

    renderHook(() => useEventPropertyValues('site-1', 'signup', 'plan', '2026-10-01', '2026-10-07', 100, F))
    expect(keyOf()).toEqual(['eventValues', 'site-1', 'signup', 'plan', '2026-10-01', '2026-10-07', '', 100, F])
    await fetcherOf()()
    expect(api.getEventPropertyValues).toHaveBeenCalledWith('site-1', 'signup', 'plan', '2026-10-01', '2026-10-07', 100, undefined, undefined, F)
  })

  it('send the page\'s period, which All time needs past 366 days, and key on it (16-11-2026)', async () => {
    renderHook(() => useEventPropertyKeys('site-1', 'signup', '2025-09-24', '2026-11-16', F, undefined, 'all'))
    expect(keyOf()).toEqual(['eventKeys', 'site-1', 'signup', '2025-09-24', '2026-11-16', 'all', F])
    await fetcherOf()()
    expect(api.getEventPropertyKeys).toHaveBeenCalledWith('site-1', 'signup', '2025-09-24', '2026-11-16', undefined, F, 'all')

    renderHook(() => useEventPropertyValues('site-1', 'signup', 'plan', '2025-09-24', '2026-11-16', 100, F, undefined, 'all'))
    expect(keyOf()).toEqual(['eventValues', 'site-1', 'signup', 'plan', '2025-09-24', '2026-11-16', 'all', 100, F])
    await fetcherOf()()
    expect(api.getEventPropertyValues).toHaveBeenCalledWith('site-1', 'signup', 'plan', '2025-09-24', '2026-11-16', 100, 'all', undefined, F)

    // The same dates under another period, or none, are another entry: the server answers each on its own terms.
    renderHook(() => useEventPropertyKeys('site-1', 'signup', '2025-09-24', '2026-11-16', F))
    expect(keyOf()).not.toContain('all')
  })

  it('another set of filters is another entry: an answer read under one is never served under the other', () => {
    renderHook(() => useEventPropertyKeys('site-1', 'signup', '2026-10-01', '2026-10-07', F))
    const mobile = JSON.stringify(keyOf())
    renderHook(() => useEventPropertyKeys('site-1', 'signup', '2026-10-01', '2026-10-07'))
    expect(JSON.stringify(keyOf())).not.toBe(mobile)
  })

  it('key a live read on the window, never on the dates, send the minutes with the filters, and refresh with the dashboard', async () => {
    renderHook(() => useEventPropertyKeys('site-1', 'signup', '2026-10-01', '2026-10-01', F, 5))
    expect(keyOf()).toEqual(['eventKeys', 'site-1', 'signup', LIVE_LIST_KEY, 5, F])
    await fetcherOf()()
    expect(api.getEventPropertyKeys).toHaveBeenCalledWith('site-1', 'signup', '2026-10-01', '2026-10-01', 5, F, undefined)
    expect(configOf().refreshInterval).toBe(15_000)

    renderHook(() => useEventPropertyValues('site-1', 'signup', 'plan', '2026-10-01', '2026-10-01', 100, F, 5))
    expect(keyOf()).toContain(LIVE_LIST_KEY)
    expect(keyOf()).not.toContain('2026-10-01')
    await fetcherOf()()
    expect(api.getEventPropertyValues).toHaveBeenCalledWith('site-1', 'signup', 'plan', '2026-10-01', '2026-10-01', 100, undefined, 5, F)
    expect(configOf().refreshInterval).toBe(15_000)
  })

  it('read nothing without an event, or without a key', () => {
    renderHook(() => useEventPropertyKeys('site-1', null, '2026-10-01', '2026-10-07', F))
    expect(keyOf()).toBeNull()
    renderHook(() => useEventPropertyValues('site-1', 'signup', null, '2026-10-01', '2026-10-07', 100, F))
    expect(keyOf()).toBeNull()
    renderHook(() => useEventPropertyValues('site-1', null, 'plan', '2026-10-01', '2026-10-07', 100, F))
    expect(keyOf()).toBeNull()
  })
})

describe('useOutboundUrls: the Outbound tab follows the page\'s filters (16-11-2026)', () => {
  const F = 'v2:country|is|NO,device|is|desktop'

  it('sends the page\'s filters with the read, and files the answer under them', async () => {
    renderHook(() => useOutboundUrls('site-1', '2026-10-01', '2026-10-07', '7d', undefined, F))
    const filtered = keyOf()
    expect(filtered).toEqual(['outboundUrls', 'site-1', '2026-10-01', '2026-10-07', '7d', F])
    await fetcherOf()()
    expect(api.getEventPropertyValues).toHaveBeenCalledWith('site-1', 'outbound_link', 'url', '2026-10-01', '2026-10-07', 1000, '7d', undefined, F)

    // Another set of filters, or none, is another cache entry: rows read under one are never shown under another.
    renderHook(() => useOutboundUrls('site-1', '2026-10-01', '2026-10-07', '7d', undefined, 'any:' + F))
    expect(JSON.stringify(keyOf())).not.toBe(JSON.stringify(filtered))
    renderHook(() => useOutboundUrls('site-1', '2026-10-01', '2026-10-07', '7d'))
    expect(JSON.stringify(keyOf())).not.toBe(JSON.stringify(filtered))
    await fetcherOf()()
    expect(api.getEventPropertyValues).toHaveBeenLastCalledWith('site-1', 'outbound_link', 'url', '2026-10-01', '2026-10-07', 1000, '7d', undefined, undefined)
  })

  it('in a live window: keyed on the window and the filters, fetched with minutes and no period', async () => {
    renderHook(() => useOutboundUrls('site-1', '2026-10-01', '2026-10-01', 'today', 5, F))
    expect(keyOf()).toEqual(['outboundUrls', 'site-1', LIVE_LIST_KEY, 5, F])
    await fetcherOf()()
    expect(api.getEventPropertyValues).toHaveBeenCalledWith('site-1', 'outbound_link', 'url', '2026-10-01', '2026-10-01', 1000, undefined, 5, F)
    // The page's live signal revalidates it with every other live list.
    expect(isLiveListKey('site-1')(keyOf())).toBe(true)
  })

  it('reads nothing while its tab is closed', () => {
    renderHook(() => useOutboundUrls('site-1', '2026-10-01', '2026-10-07', '7d', undefined, F, false))
    expect(keyOf()).toBeNull()
  })
})

describe('isLiveListKey: what the page revalidates on its live signal', () => {
  it('matches every live list of the site, and nothing dated or foreign', () => {
    const match = isLiveListKey('site-1')
    expect(match(['fullList', 'countries', 'site-1', LIVE_LIST_KEY, 5, 250, undefined])).toBe(true)
    // The Outbound tab's list, by the name its key really carries (useOutboundUrls); the old Outbound card's
    // `outbound` key left with that card and matches nothing.
    expect(match(['outboundUrls', 'site-1', LIVE_LIST_KEY, 5, undefined])).toBe(true)
    expect(match(['outbound', 'site-1', LIVE_LIST_KEY, 5])).toBe(false)
    expect(match(['campaignsList', 'site-1', LIVE_LIST_KEY, 5, 10, undefined])).toBe(true)
    // The Events block's pane follows the live window like the rows it belongs to.
    expect(match(['eventKeys', 'site-1', 'signup', LIVE_LIST_KEY, 5, undefined])).toBe(true)
    expect(match(['eventValues', 'site-1', 'signup', 'plan', LIVE_LIST_KEY, 5, 100, undefined])).toBe(true)
    expect(match(['eventKeys', 'site-1', 'signup', '2026-10-01', '2026-10-07', undefined])).toBe(false)
    expect(match(['fullList', 'countries', 'site-1', '2026-10-01', '2026-10-01', 250, undefined])).toBe(false)
    expect(match(['fullList', 'countries', 'site-2', LIVE_LIST_KEY, 5, 250, undefined])).toBe(false)
    expect(match(['dashboard', 'site-1', '', '2026-10-01', '2026-10-01', 'minute', undefined, 5])).toBe(false)
    expect(match('fullList')).toBe(false)
  })
})
