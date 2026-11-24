import { describe, it, expect } from 'vitest'
import { hidesYourSitesCrumb } from '../DashboardShell'

// R124 (24-11-2026): under the new-sites beta a team with one site never sees Your Sites, so its crumb leaves the
// site's trail; with the beta off or unknown, or with two sites or none, the crumb stays.
describe('hidesYourSitesCrumb', () => {
  it('hides the crumb only for a one-site team with the beta on', () => {
    expect(hidesYourSitesCrumb(true, 1)).toBe(true)
    expect(hidesYourSitesCrumb(true, 2)).toBe(false)
    expect(hidesYourSitesCrumb(true, 0)).toBe(false)
    expect(hidesYourSitesCrumb(false, 1)).toBe(false)
    expect(hidesYourSitesCrumb(null, 1)).toBe(false)
  })
})
