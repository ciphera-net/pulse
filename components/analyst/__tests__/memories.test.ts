// Analyst's memories, shared by the chat and Site Settings (14-11-2026): the first ask is open only while the site is
// undecided and no Not now holds it back, and never before the switch is known.
import { describe, it, expect } from 'vitest'
import { memoriesHref, memoriesKey, memoryAskOpen } from '../memories'

const NOW = Date.parse('2026-11-14T12:00:00Z')

describe('memoryAskOpen', () => {
  it('is open for an undecided site with no Not now, or one that has run out', () => {
    expect(memoryAskOpen({ enabled: null, offer_snoozed_until: null }, NOW)).toBe(true)
    expect(memoryAskOpen({ enabled: null, offer_snoozed_until: '2026-11-14T11:00:00Z' }, NOW)).toBe(true)
  })

  it('is closed while a Not now holds, once the site has decided, and before the switch is known', () => {
    expect(memoryAskOpen({ enabled: null, offer_snoozed_until: '2026-12-14T12:00:00Z' }, NOW)).toBe(false)
    expect(memoryAskOpen({ enabled: true, offer_snoozed_until: null }, NOW)).toBe(false)
    expect(memoryAskOpen({ enabled: false, offer_snoozed_until: null }, NOW)).toBe(false)
    expect(memoryAskOpen(undefined, NOW)).toBe(false)
  })
})

describe('the shared key and address', () => {
  it('names the site', () => {
    expect(memoriesKey('s1')).toEqual(['analyst-memories', 's1'])
    expect(memoriesHref('s 1')).toBe('/settings/site/analyst?siteId=s%201')
  })
})
