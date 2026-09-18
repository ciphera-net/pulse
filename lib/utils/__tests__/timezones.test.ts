import { describe, it, expect } from 'vitest'
import { TIMEZONE_OPTIONS, browserTimeZone, timezoneOptionsFor } from '@/lib/utils/timezones'

describe('timezones', () => {
  it('browserTimeZone returns a zone Intl accepts, never an empty string', () => {
    const tz = browserTimeZone()
    expect(tz).not.toBe('')
    expect(() => new Intl.DateTimeFormat('en', { timeZone: tz })).not.toThrow()
  })

  it('the option list carries UTC and Europe/Brussels with an offset label', () => {
    const utc = TIMEZONE_OPTIONS.find(o => o.value === 'UTC')
    const bru = TIMEZONE_OPTIONS.find(o => o.value === 'Europe/Brussels')
    expect(utc).toBeDefined()
    expect(bru?.label).toMatch(/^Europe\/Brussels \(GMT\+[12]\)$/)
  })

  it('timezoneOptionsFor keeps an unknown current zone selectable', () => {
    const opts = timezoneOptionsFor('Mars/Olympus_Mons')
    expect(opts[0]).toEqual({ value: 'Mars/Olympus_Mons', label: 'Mars/Olympus Mons' })
    expect(timezoneOptionsFor('UTC')).toBe(TIMEZONE_OPTIONS)
    expect(timezoneOptionsFor(null)).toBe(TIMEZONE_OPTIONS)
  })
})
