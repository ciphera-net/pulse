import { describe, it, expect } from 'vitest'
import { generatePrivacySnippet } from '../privacySnippet'
import type { Site } from '@/lib/api/sites'

/**
 * The privacy-policy snippet says how a visitor is counted. A customer pastes this into their
 * own policy, so the sentence must be true of every site: a one-day identifier whose key is
 * deleted shortly after the day ends (B1). The retired per-site window changes nothing.
 */

const base: Site = {
  id: 's1',
  user_id: 'u1',
  domain: 'demo.test',
  name: 'Demo',
  uptime_enabled: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('generatePrivacySnippet — the visitor sentence (one-day identity)', () => {
  const B1 =
    'To count visitors, Pulse makes a one-day identifier on its servers from each request’s IP address and the browser’s user-agent string, using a random key that is deleted shortly after the day ends. A visitor who returns on a later day is counted again.'

  it.each([undefined, -1, 0, 1, 7, 30] as const)('carries B1 verbatim whatever the stored window (%s)', (days) => {
    const text = generatePrivacySnippet({ ...base, identity_window_days: days })
    expect(text).toContain(B1)
    expect(text).not.toMatch(/calendar month|never recognised|at most \d+ days|at most 24 hours|short-lived, server-derived/)
  })

  it('keeps the sentence inside the second paragraph, before the documentation link', () => {
    const [p1, p2] = generatePrivacySnippet(base).split('\n\n')
    expect(p1).not.toContain('one-day identifier')
    expect(p2.indexOf('one-day identifier')).toBeLessThan(p2.indexOf("Pulse's documentation"))
  })
})

/**
 * PULSE-164: the DNT sentence is a factual claim about the site's OWN
 * respect_dnt setting, not boilerplate — it must say nothing false.
 */
describe('generatePrivacySnippet — the Do Not Track sentence', () => {
  it('includes it when the payload does not carry respect_dnt (undefined -> true)', () => {
    const [p1] = generatePrivacySnippet(base).split('\n\n')
    expect(p1).toContain('We respect Do Not Track (DNT) browser settings.')
  })

  it('includes it when respect_dnt is explicitly true', () => {
    const [p1] = generatePrivacySnippet({ ...base, respect_dnt: true }).split('\n\n')
    expect(p1).toContain('We respect Do Not Track (DNT) browser settings.')
  })

  it('omits it entirely when respect_dnt is false — no new copy in its place', () => {
    const [p1] = generatePrivacySnippet({ ...base, respect_dnt: false }).split('\n\n')
    expect(p1).not.toContain('Do Not Track')
    expect(p1).not.toContain('DNT')
    expect(p1).toBe('We use Pulse to understand how visitors use our site. Pulse does not use cookies.')
  })

  it('never mentions Global Privacy Control — GPC has no policy sentence here', () => {
    const text = generatePrivacySnippet({ ...base, respect_gpc: false })
    expect(text).not.toMatch(/Global Privacy Control|GPC/)
  })
})

/**
 * The snippet speaks in the customer's name, in their privacy policy. It must not claim what does not hold for every
 * site: that the data is anonymous, that no consent is needed, or that nothing is kept in the browser.
 */
describe('generatePrivacySnippet — claims it must never make', () => {
  const sites: Site[] = [
    base,
    { ...base, identity_window_days: -1 },
    { ...base, identity_window_days: 0 },
    { ...base, identity_window_days: 7 },
    { ...base, collect_page_paths: false, collect_referrers: false, collect_device_info: false, collect_geo_data: 'none', collect_screen_resolution: false, collect_audience_data: false } as Site,
  ]

  it.each(sites.map((s, i) => [i, s] as const))('site variant %i', (_, site) => {
    const text = generatePrivacySnippet(site)
    expect(text).not.toMatch(/anonymous|consent banner|persistent identifier|never stored|nothing stored|discarded/i)
  })

  it('says plainly when nothing but a page view is collected', () => {
    const text = generatePrivacySnippet(sites[4])
    expect(text).toContain('We collect only that a page was viewed.')
  })
})
