import { describe, expect, it } from 'vitest'
import { getTimezoneCountry } from '@/components/dashboard/Locations'
import { TIMEZONE_COUNTRY, TZDATA_VERSION } from '@/lib/timezone-countries.gen'

/**
 * The Timezones tab shows a flag for a zone's country (PULSE-170). It used a hand-written list
 * of ~45 zones, so a trial customer's first day showed flags on Europe/Moscow, Europe/Brussels
 * and Europe/Paris and none on Asia/Tbilisi, Asia/Baku, Europe/Samara or Asia/Yekaterinburg.
 * The map is now generated from IANA tzdata (zone.tab + backward).
 */
describe('timezone → flag country', () => {
  it.each([
    ['Asia/Tbilisi', 'GE'],
    ['Asia/Baku', 'AZ'],
    ['Europe/Samara', 'RU'],
    ['Asia/Yekaterinburg', 'RU'],
    ['Europe/Moscow', 'RU'],
    ['Europe/Brussels', 'BE'],
    ['Europe/Paris', 'FR'],
    ['America/Argentina/Buenos_Aires', 'AR'],
  ])('%s → %s (the zones the customer saw, and the old list\'s ones still work)', (tz, code) => {
    expect(getTimezoneCountry(tz)).toBe(code)
  })

  // * Browsers still send legacy link names: Chrome reports Asia/Calcutta even when the OS is
  // * set to Asia/Kolkata (the 21-09-2026 site-timezone incident).
  it.each([
    ['Asia/Calcutta', 'IN'],
    ['Europe/Kiev', 'UA'],
  ])('legacy link %s → %s', (tz, code) => {
    expect(getTimezoneCountry(tz)).toBe(code)
  })

  // * A zone listed in zone.tab keeps its own country even when backward also links it
  // * elsewhere (Europe/Ljubljana links to Europe/Belgrade, but it is Slovenia's zone).
  it('a zone.tab entry beats a backward link', () => {
    expect(getTimezoneCountry('Europe/Ljubljana')).toBe('SI')
  })

  it.each(['Etc/UTC', 'UTC', 'Etc/GMT+3', 'Unknown', '', 'Not/AZone'])(
    '%s belongs to no country and shows no flag',
    (tz) => {
      expect(getTimezoneCountry(tz)).toBe('')
    },
  )

  it('the generated map is complete enough to be the real list, not a stub', () => {
    expect(TZDATA_VERSION).toMatch(/^20\d\d[a-z]$/)
    expect(Object.keys(TIMEZONE_COUNTRY).length).toBeGreaterThan(400)
    for (const code of Object.values(TIMEZONE_COUNTRY)) expect(code).toMatch(/^[A-Z]{2}$/)
  })
})
