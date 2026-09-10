import { describe, it, expect } from 'vitest'
import { visitorPseudonym, PSEUDONYM_POOL } from '../pseudonym'
import {
  EM_DASH,
  countryName,
  daysUntilMonthReset,
  formatDuration,
  formatLastSeen,
  formatShortDate,
  formatVisitStart,
  monthResetDate,
  visitorLocalTime,
  zonedDayOfMonth,
  zonedMonthKey,
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

  it('buckets a day and a month by the site’s calendar', () => {
    expect(zonedDayOfMonth(CROSSES_MIDNIGHT, 'Europe/Brussels')).toBe(31)
    expect(zonedDayOfMonth(CROSSES_MIDNIGHT, 'Pacific/Auckland')).toBe(1)
    expect(zonedMonthKey(CROSSES_MIDNIGHT, 'Europe/Brussels')).toBe('2026-08')
    expect(zonedMonthKey(CROSSES_MIDNIGHT, 'Pacific/Auckland')).toBe('2026-09')
  })

  it('renders an unparseable instant as an em dash, never as 1970', () => {
    expect(formatShortDate('not-a-date', 'UTC')).toBe(EM_DASH)
    expect(formatLastSeen('not-a-date', 'UTC')).toBe(EM_DASH)
    expect(formatVisitStart('not-a-date', 'UTC')).toBe(EM_DASH)
    expect(zonedDayOfMonth('not-a-date', 'UTC')).toBeNull()
    expect(zonedMonthKey('not-a-date', 'UTC')).toBeNull()
  })
})

describe('the identity horizon comes from the server’s instant', () => {
  // The server sends `month_resets_at`: midnight on the 1st of the following
  // month IN THE SITE'S ZONE. The page used to derive it from the 'YYYY-MM'
  // string with `new Date(y, m, 1)` — browser midnight — which is a different
  // instant for every reader.
  const AUGUST_RESET_BRUSSELS = '2026-08-31T22:00:00Z' // 1 Sep 00:00 CEST

  it('counts the days left from the instant', () => {
    const now = Date.parse('2026-08-30T00:00:00Z')
    expect(daysUntilMonthReset(AUGUST_RESET_BRUSSELS, now)).toBe(2)
  })

  it('is null once the reset has happened — it is not "coming"', () => {
    const now = Date.parse('2026-09-15T12:00:00Z')
    expect(daysUntilMonthReset(AUGUST_RESET_BRUSSELS, now)).toBeNull()
  })

  it('🔴 is null for TODAY against an August identity — the tense bug', () => {
    // The live symptom on 10-09-2026: the header said "this identity resets
    // 1 Sep", present tense, nine days late, on 322 of one site's 517 rows.
    // Null here is what makes the page switch to the past tense and what makes
    // MonthRibbon hide its "resets in N days" caption.
    const tenSeptember = Date.parse('2026-09-10T12:00:00Z')
    expect(daysUntilMonthReset(AUGUST_RESET_BRUSSELS, tenSeptember)).toBeNull()
  })

  it('says nothing at all when the server sent no instant', () => {
    // Not a guess, not an em dash inside a sentence — the caller drops the
    // clause entirely, which is what a null return is for.
    expect(daysUntilMonthReset(null)).toBeNull()
    expect(daysUntilMonthReset(undefined)).toBeNull()
    expect(monthResetDate(null, 'UTC')).toBeNull()
    expect(monthResetDate('not-a-date', 'UTC')).toBeNull()
  })

  it('formats the reset date in the site’s zone, so it names the 1st', () => {
    // 🔑 THE POINT: this instant is 31 AUGUST in UTC and in every negative
    // offset. Only the site's own zone calls it the 1st, and the sentence
    // beside it promises a reset "on the 1st of the month".
    expect(monthResetDate(AUGUST_RESET_BRUSSELS, 'Europe/Brussels')).toBe('1 Sept')
    expect(monthResetDate(AUGUST_RESET_BRUSSELS, 'UTC')).toBe('31 Aug')
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
    const { from, to, ticks } = presenceTicks({ start: '2026-08-26', end: '2026-08-30' }, 30, 'Europe/Brussels')
    expect(to - from).toBe(30 * 60_000)
    for (const t of ticks) expect(t.label).toMatch(/^\d{2}:\d{2}$/)
  })

  it('anchors a date range to the SITE’s midnights, not the reader’s', () => {
    // 🔴 The domain used to be `new Date('2026-08-26T00:00:00')` — no zone
    // suffix, so BROWSER midnight — while start/end are the days the SERVER
    // resolved in the site's zone and queried with. A reader in New York was
    // positioning Brussels dots against an axis six hours out of step with the
    // window the rows came from.
    const brussels = presenceTicks({ start: '2026-08-26', end: '2026-08-30' }, null, 'Europe/Brussels')
    const auckland = presenceTicks({ start: '2026-08-26', end: '2026-08-30' }, null, 'Pacific/Auckland')

    // 26 August 00:00 CEST is 25 August 22:00 UTC.
    expect(brussels.from).toBe(Date.parse('2026-08-25T22:00:00Z'))
    // 26 August 00:00 NZST is 25 August 12:00 UTC — ten hours earlier again.
    expect(auckland.from).toBe(Date.parse('2026-08-25T12:00:00Z'))
    expect(brussels.from).not.toBe(auckland.from)

    // A dot for an event at 23:50 on the final day belongs INSIDE the field,
    // not past its right edge: the domain runs to that day's last second.
    expect(brussels.to).toBe(Date.parse('2026-08-30T21:59:59Z'))
    expect(brussels.to).toBeGreaterThan(brussels.from)
    for (const t of brussels.ticks) expect(t.label).toMatch(/^\d{2}\/\d{2}$/)
    // The first gridline is the site's own first day.
    expect(brussels.ticks[0].label).toBe('26/08')
  })
})
