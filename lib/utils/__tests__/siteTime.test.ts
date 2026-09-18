import { describe, it, expect } from 'vitest'
import { safeTimeZone, formatSiteStamp, formatSiteStampShort, formatSiteDay, siteWallClockNow } from '../siteTime'

// Site-time display for instants (22-08-2026 alignment design). The suite
// runs under TZ=UTC, so every Brussels expectation passing proves the
// formatters follow the SITE's zone, never the viewer's.

describe('safeTimeZone', () => {
  it('passes a valid IANA zone through', () => {
    expect(safeTimeZone('Europe/Brussels')).toBe('Europe/Brussels')
  })

  it('falls back to UTC for a zone Intl rejects — never throws', () => {
    expect(safeTimeZone('Not/AZone')).toBe('UTC')
  })

  it('falls back to UTC for null/undefined/empty', () => {
    expect(safeTimeZone(null)).toBe('UTC')
    expect(safeTimeZone(undefined)).toBe('UTC')
    expect(safeTimeZone('')).toBe('UTC')
  })
})

describe('formatSiteStamp', () => {
  it('renders in the site zone and self-labels it', () => {
    // 21:15Z in August-Brussels is 23:15 CEST.
    expect(formatSiteStamp('2026-08-13T21:15:00Z', 'Europe/Brussels')).toBe('13 Aug 2026, 23:15 CEST')
  })

  it('crosses the day boundary honestly — the DATE follows the zone too', () => {
    // 23:30Z is already the NEXT day in Brussels. A formatter that converted
    // the time but kept the UTC date would misdate every late-evening check.
    expect(formatSiteStamp('2026-08-13T23:30:00Z', 'Europe/Brussels')).toBe('14 Aug 2026, 01:30 CEST')
  })

  it('an invalid zone degrades to labelled UTC, not a crash', () => {
    expect(formatSiteStamp('2026-08-13T23:30:00Z', 'Not/AZone')).toBe('13 Aug 2026, 23:30 UTC')
  })
})

describe('formatSiteStampShort / formatSiteDay', () => {
  it('short stamp is terse and zone-correct (label lives on the full stamp)', () => {
    expect(formatSiteStampShort('2026-08-13T23:30:00Z', 'Europe/Brussels')).toBe('14 Aug, 01:30')
  })

  it('day label follows the site zone', () => {
    expect(formatSiteDay('2026-08-13T23:30:00Z', 'Europe/Brussels')).toBe('14 Aug')
    expect(formatSiteDay('2026-08-13T23:30:00Z', null)).toBe('13 Aug')
  })
})

// ---------------------------------------------------------------------------
// siteWallClockNow (18-09-2026 preset-site-zone alignment) — a Date whose
// LOCAL getters equal the SITE's wall clock, so `formatDate`/`setDate`/etc.
// arithmetic (which reads local getters) yields the site's calendar days
// regardless of the RUNTIME's own zone. The invariant under test is a
// round-trip: local-getter reads of the returned Date must equal the site's
// y/m/d/h/mi for the given instant — true under any runtime TZ, which is
// the entire point of building it this way instead of with Date.UTC.
// ---------------------------------------------------------------------------
describe('siteWallClockNow', () => {
  it('projects the site zone wall clock onto local getters', () => {
    // 21:15Z in August-Brussels is 23:15 CEST.
    const d = siteWallClockNow('Europe/Brussels', new Date('2026-08-13T21:15:00Z'))
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(7) // August, 0-indexed
    expect(d.getDate()).toBe(13)
    expect(d.getHours()).toBe(23)
    expect(d.getMinutes()).toBe(15)
  })

  it('crosses the day boundary — a late-evening UTC instant is already the next site day', () => {
    const d = siteWallClockNow('Europe/Brussels', new Date('2026-08-13T23:30:00Z'))
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(7)
    expect(d.getDate()).toBe(14)
    expect(d.getHours()).toBe(1)
    expect(d.getMinutes()).toBe(30)
  })

  it('degrades an unknown/invalid zone to UTC — never throws', () => {
    const d1 = siteWallClockNow(null, new Date('2026-08-13T23:30:00Z'))
    expect(d1.getFullYear()).toBe(2026)
    expect(d1.getMonth()).toBe(7)
    expect(d1.getDate()).toBe(13)
    expect(d1.getHours()).toBe(23)
    expect(d1.getMinutes()).toBe(30)

    expect(() => siteWallClockNow('Not/AZone', new Date('2026-08-13T23:30:00Z'))).not.toThrow()
  })

  it('handles a DST transition day correctly (Europe/Brussels falls back 25-10-2026)', () => {
    // 00:30Z is still CEST (UTC+2) before the 01:00Z transition instant.
    const before = siteWallClockNow('Europe/Brussels', new Date('2026-10-25T00:30:00Z'))
    expect(before.getFullYear()).toBe(2026)
    expect(before.getMonth()).toBe(9) // October
    expect(before.getDate()).toBe(25)
    expect(before.getHours()).toBe(2)
    expect(before.getMinutes()).toBe(30)

    // 01:30Z is already CET (UTC+1) — the repeated local hour, resolved
    // correctly by Intl from the real instant rather than naive arithmetic.
    const after = siteWallClockNow('Europe/Brussels', new Date('2026-10-25T01:30:00Z'))
    expect(after.getFullYear()).toBe(2026)
    expect(after.getMonth()).toBe(9)
    expect(after.getDate()).toBe(25)
    expect(after.getHours()).toBe(2)
    expect(after.getMinutes()).toBe(30)
  })

  it('handles a half-hour-offset zone (Asia/Kolkata, UTC+5:30)', () => {
    const d = siteWallClockNow('Asia/Kolkata', new Date('2026-09-19T00:00:00Z'))
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(8) // September
    expect(d.getDate()).toBe(19)
    expect(d.getHours()).toBe(5)
    expect(d.getMinutes()).toBe(30)
  })

  it('defaults `at` to the real current instant when omitted', () => {
    const before = Date.now()
    const d = siteWallClockNow('UTC')
    const after = Date.now()
    // Reconstruct the instant the local getters imply and check it falls in
    // [before, after] — proves `at` really defaulted to `new Date()`, not to
    // some frozen value.
    const reconstructed = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes())).getTime()
    expect(reconstructed).toBeGreaterThanOrEqual(before - 60_000)
    expect(reconstructed).toBeLessThanOrEqual(after + 60_000)
  })
})
