import { describe, it, expect } from 'vitest'
import { ago, shortDate, sitesWord } from '../format'

// The copy deck's one time format (§2) and its short date with the year only when it is not this one (§11.6, 3).
const now = new Date('2026-11-06T20:00:00Z')

describe('shortDate', () => {
  it('drops the year inside this year and keeps it outside', () => {
    expect(shortDate('2026-11-03T10:00:00Z', 'UTC', now)).toBe('3 Nov')
    expect(shortDate('2027-09-11T10:00:00Z', 'UTC', now)).toBe('11 Sep 2027')
    expect(shortDate('2020-01-01T00:00:00Z', 'UTC', now)).toBe('1 Jan 2020')
  })
  it('writes September as Sep, never Intl\'s Sept', () => {
    expect(shortDate('2026-09-30T10:00:00Z', 'UTC', now)).toBe('30 Sep')
  })
  it('reads the day in the display zone', () => {
    // 23:30 UTC on 3 Nov is already 4 Nov in Brussels and still 3 Nov in New York.
    expect(shortDate('2026-11-03T23:30:00Z', 'Europe/Brussels', now)).toBe('4 Nov')
    expect(shortDate('2026-11-03T23:30:00Z', 'America/New_York', now)).toBe('3 Nov')
  })
})

describe('ago', () => {
  const before = (seconds: number) => new Date(now.getTime() - seconds * 1000).toISOString()
  it('counts in the deck\'s words', () => {
    expect(ago(before(20), 'UTC', now)).toBe('just now')
    expect(ago(before(27 * 60), 'UTC', now)).toBe('27 min ago')
    expect(ago(before(3 * 3600), 'UTC', now)).toBe('3 h ago')
    expect(ago(before(86400), 'UTC', now)).toBe('1 day ago')
    expect(ago(before(9 * 86400), 'UTC', now)).toBe('9 days ago')
    expect(ago(before(40 * 86400), 'UTC', now)).toBe('on 27 Sep')
  })
  it('never says a moment in the future is ahead', () => {
    expect(ago(new Date(now.getTime() + 60_000).toISOString(), 'UTC', now)).toBe('just now')
  })
})

describe('sitesWord', () => {
  it('says all, one or many', () => {
    expect(sitesWord(true, [])).toBe('All sites')
    expect(sitesWord(false, ['a'])).toBe('1 site')
    expect(sitesWord(false, ['a', 'b', 'c'])).toBe('3 sites')
  })
})
