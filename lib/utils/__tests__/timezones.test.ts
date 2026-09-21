import { describe, it, expect } from 'vitest'
import {
  TIMEZONE_GROUPS,
  TIMEZONE_OPTIONS,
  browserTimeZone,
  timezoneGroupsFor,
} from '@/lib/utils/timezones'

/**
 * The curated site-timezone list (PULSE-5, 21-09-2026). These tests exist to
 * stop a future edit quietly doing what the old list did: offering a zone that
 * does not work, or dropping a day boundary nobody noticed was the only way to
 * express somewhere on earth.
 */
describe('the curated timezone list', () => {
  it('offers only zones this runtime actually accepts', () => {
    const rejected = TIMEZONE_OPTIONS.filter(o => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: o.value })
        return false
      } catch {
        return true
      }
    })
    expect(rejected.map(o => o.value)).toEqual([])
  })

  it('names every zone once', () => {
    const values = TIMEZONE_OPTIONS.map(o => o.value)
    expect(values).toHaveLength(new Set(values).size)
  })

  // The floor the list may not fall through. A site's timezone decides its day
  // boundary; two zones can express the same boundary only if they agree in
  // BOTH January and July (offset alone would merge Brussels, which observes
  // DST, with Johannesburg, which does not). Every class the runtime knows must
  // be reachable from the curated list, or somewhere on earth cannot state its
  // own day.
  it('can express every day boundary the runtime knows', () => {
    const jan = new Date(Date.UTC(2026, 0, 15, 12))
    const jul = new Date(Date.UTC(2026, 6, 15, 12))
    const offset = (tz: string, at: Date) =>
      new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
        .formatToParts(at)
        .find(p => p.type === 'timeZoneName')!.value
    const boundary = (tz: string) => `${offset(tz, jan)}|${offset(tz, jul)}`

    const everyClass = new Set(Intl.supportedValuesOf('timeZone').map(boundary))
    const ourClasses = new Set(TIMEZONE_OPTIONS.map(o => boundary(o.value)))
    const missing = [...everyClass].filter(c => !ourClasses.has(c))

    expect(missing).toEqual([])
    // A floor, not an exact count: the runtime's tzdata may add a class, and
    // this test is what will say so.
    expect(everyClass.size).toBeGreaterThanOrEqual(57)
  })

  it('is short enough to scan, and grouped', () => {
    expect(TIMEZONE_OPTIONS.length).toBeLessThan(200)
    expect(TIMEZONE_GROUPS.length).toBeGreaterThanOrEqual(6)
    expect(TIMEZONE_GROUPS.every(g => g.label && g.options.length > 0)).toBe(true)
    expect(TIMEZONE_GROUPS.flatMap(g => g.options)).toEqual(TIMEZONE_OPTIONS)
  })

  // The reason the list is ours rather than the browser's: this runtime's ICU
  // enumerates the outdated alias, so a list built from it shows customers
  // "Europe/Kiev" and "Asia/Calcutta". Ours must not.
  it('uses current names, not the aliases the browser enumerates', () => {
    const values = TIMEZONE_OPTIONS.map(o => o.value)
    for (const modern of ['Europe/Kyiv', 'Asia/Kolkata', 'Asia/Ho_Chi_Minh', 'Asia/Yangon', 'Asia/Kathmandu']) {
      expect(values).toContain(modern)
    }
    for (const stale of ['Europe/Kiev', 'Asia/Calcutta', 'Asia/Saigon', 'Asia/Rangoon', 'Asia/Katmandu']) {
      expect(values).not.toContain(stale)
    }
  })

  it('labels a zone with the offset it is on right now', () => {
    const brussels = TIMEZONE_OPTIONS.find(o => o.value === 'Europe/Brussels')
    expect(brussels?.label).toMatch(/^Europe\/Brussels \(GMT\+[12]\)$/)
    expect(TIMEZONE_OPTIONS.find(o => o.value === 'UTC')?.label).toMatch(/^UTC/)
    // Underscores are an IANA spelling, not a name anyone reads.
    expect(TIMEZONE_OPTIONS.find(o => o.value === 'America/New_York')?.label).toContain('New York')
  })
})

describe('timezoneGroupsFor', () => {
  it('returns the curated groups unchanged for a curated zone, and for none', () => {
    expect(timezoneGroupsFor('Europe/Brussels')).toBe(TIMEZONE_GROUPS)
    expect(timezoneGroupsFor(null)).toBe(TIMEZONE_GROUPS)
    expect(timezoneGroupsFor('')).toBe(TIMEZONE_GROUPS)
  })

  // A site stored before this list existed can hold any of the 418, including
  // the browser spellings we deliberately stopped offering. It must still show
  // its own value rather than the placeholder.
  it('keeps a stored zone that is not curated, in its own group at the top', () => {
    const groups = timezoneGroupsFor('Asia/Saigon')
    expect(groups[0].label).toBe('Current setting')
    expect(groups[0].options).toEqual([{ value: 'Asia/Saigon', label: expect.stringContaining('Asia/Saigon') }])
    expect(groups.slice(1)).toEqual(TIMEZONE_GROUPS)
    expect(groups.flatMap(g => g.options).filter(o => o.value === 'Asia/Saigon')).toHaveLength(1)
  })

  it('does not throw on a zone this runtime has never heard of', () => {
    const groups = timezoneGroupsFor('Mars/Olympus_Mons')
    expect(groups[0].options[0]).toEqual({ value: 'Mars/Olympus_Mons', label: 'Mars/Olympus Mons' })
  })
})

describe('browserTimeZone', () => {
  it('returns a zone Intl accepts, never an empty string', () => {
    const tz = browserTimeZone()
    expect(tz).not.toBe('')
    expect(() => new Intl.DateTimeFormat('en', { timeZone: tz })).not.toThrow()
  })
})
