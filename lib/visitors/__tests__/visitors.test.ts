import { describe, it, expect } from 'vitest'
import { visitorPseudonym, PSEUDONYM_POOL } from '../pseudonym'
import {
  EM_DASH,
  countryName,
  daysUntilMonthReset,
  formatDuration,
  visitorLocalTime,
} from '../format'
import { VISITORS_MIN_DATE, VISITORS_ROLLING_MINUTES, presenceTicks } from '../range'

describe('visitorPseudonym', () => {
  it('is deterministic — the same key always names the same reader', () => {
    const key = 'f3a1c9d2f3a1c9d2f3a1c9d2f3a1c9d2'
    expect(visitorPseudonym(key)).toBe(visitorPseudonym(key))
  })

  it('varies the adjective and the persona independently', () => {
    // Same first 4 hex (same adjective), different second 4 (different persona).
    const a = visitorPseudonym('0000000100000000000000000000000a')
    const b = visitorPseudonym('0000000200000000000000000000000a')
    expect(a.split(' ')[0]).toBe(b.split(' ')[0])
    expect(a.split(' ')[1]).not.toBe(b.split(' ')[1])
  })

  it('survives a malformed key rather than crashing the row', () => {
    // A row the server sent is a row the page shows. parseInt on a non-hex
    // slice yields NaN, which must not become "undefined undefined".
    expect(visitorPseudonym('zzzz')).toMatch(/^\w+ \w+$/)
    expect(visitorPseudonym('')).toMatch(/^\w+ \w+$/)
  })

  it('draws on a mixed pool of both approved vocabularies (D10)', () => {
    const names = new Set<string>()
    for (let i = 0; i < 4096; i++) {
      names.add(visitorPseudonym(i.toString(16).padStart(8, '0') + '0'.repeat(24)))
    }
    // Both vocabularies must be reachable: a "way of reading" and a "quiet
    // occupation". If a future edit split the pools, this fails.
    const all = [...names].join(' ')
    expect(all).toContain('Reader')
    expect(all).toContain('Baker')
    expect(PSEUDONYM_POOL.adjectives * PSEUDONYM_POOL.personas).toBeGreaterThan(500)
  })
})

describe('format helpers never fabricate', () => {
  it('renders an absent duration as an em dash, not 0s', () => {
    // 🔴 The whole of D7 in one assertion. A zero is a measurement ("they left
    // instantly"); an em dash is the absence of one.
    expect(formatDuration(null)).toBe(EM_DASH)
    expect(formatDuration(undefined)).toBe(EM_DASH)
    expect(formatDuration(0)).toBe('0s')
  })

  it('formats durations at each scale', () => {
    expect(formatDuration(58)).toBe('58s')
    expect(formatDuration(185)).toBe('3m 05s')
    expect(formatDuration(3900)).toBe('1h 05m')
  })

  it('renders an absent country as an em dash and echoes an unmappable code', () => {
    expect(countryName(null)).toBe(EM_DASH)
    expect(countryName('BE')).toBe('Belgium')
    // GeoIP aggregate pseudo-codes are not countries. Echoing is honest; we
    // know the bucket, not the country.
    expect(countryName('T1')).toBe('T1')
  })

  it('returns null — never the viewer’s own clock — with no visitor timezone', () => {
    // Showing the dashboard reader's local time under a label that says "where
    // THEY are" would be a confident fabrication.
    expect(visitorLocalTime(null)).toBeNull()
    expect(visitorLocalTime('Not/AZone')).toBeNull()
    expect(visitorLocalTime('Europe/Brussels')).toMatch(/^\d{2}:\d{2}$/)
  })
})

describe('daysUntilMonthReset', () => {
  it('counts the days left in the identity month', () => {
    const now = new Date(2026, 7, 30, 12, 0, 0).getTime() // 30 Aug 2026, local
    expect(daysUntilMonthReset('2026-08', now)).toBe(2)
  })

  it('is null for a month that has already reset — it is not "coming"', () => {
    const now = new Date(2026, 8, 15, 12, 0, 0).getTime() // 15 Sep 2026
    expect(daysUntilMonthReset('2026-08', now)).toBeNull()
  })
})

describe('the range declaration', () => {
  it('floors at the identity-rebuild cutover', () => {
    // 🔴 Must agree with database.VisitorIdentityEpoch on the server
    // (2026-08-26T11:17:46Z). Earlier days hold no visitor identity at all.
    expect(VISITORS_MIN_DATE).toBe('2026-08-26')
  })

  it('declares every live preset as rolling MINUTES', () => {
    expect(VISITORS_ROLLING_MINUTES).toEqual({ '30m': 30, '1h': 60, '6h': 360, '24h': 1440 })
  })

  it('gives a rolling window minute ticks, not day ticks', () => {
    const { from, to, ticks } = presenceTicks({ start: '2026-08-26', end: '2026-08-30' }, 30)
    expect(to - from).toBe(30 * 60_000)
    for (const t of ticks) expect(t.label).toMatch(/^\d{2}:\d{2}$/)
  })

  it('runs a date range to the END of its last day', () => {
    // A dot for an event at 23:50 on the final day belongs INSIDE the field,
    // not past its right edge.
    const { from, to, ticks } = presenceTicks({ start: '2026-08-26', end: '2026-08-30' }, null)
    expect(new Date(to).getHours()).toBe(23)
    expect(to).toBeGreaterThan(from)
    for (const t of ticks) expect(t.label).toMatch(/^\d{2}\/\d{2}$/)
  })
})
