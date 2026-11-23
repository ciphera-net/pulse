import { describe, it, expect } from 'vitest'
import { visitorPseudonym, PSEUDONYM_POOL } from '../pseudonym'
import {
  EM_DASH,
  countryName,
  formatDuration,
  formatLastSeen,
  formatShortDate,
  formatVisitStart,
  visitorLocalTime,
} from '../format'

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

// ─────────────────────────────────────────────────────────────────────
// Audit §2.4. Every one of these used to be computed in the READER's
// timezone against data the server buckets in the SITE's. Measured on
// staging: one visitor, one site, "First seen 28 Aug" from Auckland and
// "27 Aug" from Brussels.
//
// 🔑 THE ASSERTIONS ARE RUNNER-INDEPENDENT BY CONSTRUCTION. vitest.setup.ts
// pins TZ to America/New_York and `npm run test:tz-positive` re-runs this
// file at UTC+14 — so anything that leaked back to the machine's own zone
// fails in at least one of the two, and the pairs below (Brussels vs
// Auckland, which straddle the fixture instant) fail in both.
//
// Where an exact string is asserted it is one ICU spells stably. September
// is NOT one of those: en-GB renders it "Sept", not "Sep", on current ICU —
// so the September cases assert the difference between zones rather than a
// literal, which is the property that actually matters here.
// ─────────────────────────────────────────────────────────────────────

// 20:00 UTC on 31 August is 22:00 on the 31st in Brussels and 08:00 on
// 1 September in Auckland. One instant, two calendar days, two months.
const CROSSES_MIDNIGHT = '2026-08-31T20:00:00Z'

describe('dates render in the SITE calendar, never the reader’s', () => {
  it('formatShortDate names the site’s day', () => {
    expect(formatShortDate(CROSSES_MIDNIGHT, 'Europe/Brussels')).toBe('31 Aug')
    expect(formatShortDate(CROSSES_MIDNIGHT, 'Pacific/Auckland')).not.toBe(
      formatShortDate(CROSSES_MIDNIGHT, 'Europe/Brussels'),
    )
    // Auckland is already into the next month, so its label says so.
    expect(formatShortDate(CROSSES_MIDNIGHT, 'Pacific/Auckland')).toMatch(/^1 Sep/)
  })

  it('formatVisitStart decides "Today" on the site’s clock', () => {
    // now = 02:00 UTC on 1 September. In Brussels that is the 1st (04:00); in
    // New York it is still 31 August (22:00). A visit at 20:00Z on the 31st is
    // therefore YESTERDAY in Brussels and TODAY in New York.
    const now = Date.parse('2026-09-01T02:00:00Z')
    expect(formatVisitStart(CROSSES_MIDNIGHT, 'America/New_York', now)).toMatch(/^Today /)
    expect(formatVisitStart(CROSSES_MIDNIGHT, 'Europe/Brussels', now)).toMatch(/^31 Aug /)
  })

  it('formatVisitStart prints the site’s clock time, not the viewer’s', () => {
    const now = Date.parse('2026-09-05T12:00:00Z')
    expect(formatVisitStart(CROSSES_MIDNIGHT, 'Europe/Brussels', now)).toBe('31 Aug 22:00')
    expect(formatVisitStart(CROSSES_MIDNIGHT, 'America/New_York', now)).toBe('31 Aug 16:00')
  })

  it('formatLastSeen decides "Yesterday" on the site’s calendar', () => {
    // 34 hours after the fixture instant, so the 24h relative arm is past and
    // the CALENDAR arm decides. Verified: at 06:00Z on 2 September every zone
    // below is on the 2nd, but they disagree about when the visit was —
    // Auckland saw it on the 1st (one day back, "Yesterday"), Brussels and New
    // York on 31 August (two days back, a date label). One instant, one
    // visitor, two different words.
    const now = Date.parse('2026-09-02T06:00:00Z')
    expect(formatLastSeen(CROSSES_MIDNIGHT, 'Pacific/Auckland', now)).toBe('Yesterday')
    expect(formatLastSeen(CROSSES_MIDNIGHT, 'America/New_York', now)).toBe('31 Aug')
    expect(formatLastSeen(CROSSES_MIDNIGHT, 'Europe/Brussels', now)).toBe('31 Aug')
  })

  it('formatLastSeen keeps the relative arm zone-free — an hour is an hour', () => {
    const now = Date.parse('2026-08-31T23:00:00Z')
    for (const tz of ['Pacific/Auckland', 'America/New_York', 'UTC']) {
      expect(formatLastSeen(CROSSES_MIDNIGHT, tz, now)).toBe('3h ago')
    }
  })

  it('renders an unparseable instant as an em dash, never as 1970', () => {
    expect(formatShortDate('not-a-date', 'UTC')).toBe(EM_DASH)
    expect(formatLastSeen('not-a-date', 'UTC')).toBe(EM_DASH)
    expect(formatVisitStart('not-a-date', 'UTC')).toBe(EM_DASH)
  })
})
