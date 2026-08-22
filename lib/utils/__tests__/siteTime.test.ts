import { describe, it, expect } from 'vitest'
import { safeTimeZone, formatSiteStamp, formatSiteStampShort, formatSiteDay } from '../siteTime'

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
