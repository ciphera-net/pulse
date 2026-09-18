import { describe, it, expect } from 'vitest'
import { resolveDisplayZone } from '@/lib/hooks/useDisplayZone'

// The six cells of the resolution table in useDisplayZone.ts, plus the two
// guards that keep a bad zone from throwing at render.
describe('resolveDisplayZone', () => {
  const browser = 'Asia/Tokyo'
  const site = 'Europe/Brussels'

  it("site mode with a site: the site's zone, labelled as the site's", () => {
    expect(resolveDisplayZone('site', site, browser)).toEqual({
      mode: 'site', zone: 'Europe/Brussels', label: "Site's timezone · Europe/Brussels",
    })
  })

  it('site mode without a site: the browser, labelled as yours (an account page has no site calendar)', () => {
    expect(resolveDisplayZone('site', null, browser)).toEqual({
      mode: 'site', zone: 'Asia/Tokyo', label: 'Your timezone · Asia/Tokyo',
    })
    expect(resolveDisplayZone('site', '', browser).zone).toBe('Asia/Tokyo')
  })

  it('local mode: the browser, with or without a site', () => {
    expect(resolveDisplayZone('local', site, browser).zone).toBe('Asia/Tokyo')
    expect(resolveDisplayZone('local', null, browser).zone).toBe('Asia/Tokyo')
  })

  it('utc mode: UTC, with or without a site', () => {
    expect(resolveDisplayZone('utc', site, browser)).toEqual({ mode: 'utc', zone: 'UTC', label: 'UTC' })
    expect(resolveDisplayZone('utc', null, browser).zone).toBe('UTC')
  })

  it('never hands an unknown zone to a formatter: falls to UTC instead of throwing', () => {
    expect(resolveDisplayZone('site', 'Mars/Olympus_Mons', browser).zone).toBe('UTC')
    expect(resolveDisplayZone('local', site, 'not-a-zone').zone).toBe('UTC')
  })
})
