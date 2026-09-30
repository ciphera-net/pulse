import { describe, it, expect } from 'vitest'
import { generatePrivacySnippet } from '../privacySnippet'
import type { Site } from '@/lib/api/sites'

/**
 * The privacy-policy snippet describes the site's SAVED identity window
 * (design doc 11-09-2026 §6, phase 4). A customer pastes this into their own
 * policy, so a sentence that asserts the month on a site set to "Session only"
 * would be a false statement in somebody else's legal document.
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

describe('generatePrivacySnippet — the identity window sentence', () => {
  it('names the calendar month on the default', () => {
    const text = generatePrivacySnippet({ ...base, identity_window_days: 0 })
    expect(text).toContain('reset at the end of each calendar month')
  })

  it('says a returning visitor is never recognised on a site set to Session only', () => {
    const text = generatePrivacySnippet({ ...base, identity_window_days: -1 })
    expect(text).toContain('never recognised on a later visit')
    expect(text).not.toMatch(/calendar month/)
  })

  it.each([[1, '24 hours'], [7, '7 days'], [30, '30 days']] as const)(
    'names a rolling window of %s as a ceiling — "at most %s"',
    (days, span) => {
      const text = generatePrivacySnippet({ ...base, identity_window_days: days })
      expect(text).toContain(`discarded after at most ${span}`)
      expect(text).not.toMatch(/calendar month|exactly/)
    },
  )

  it('asserts nothing about the window when the payload does not carry it', () => {
    const text = generatePrivacySnippet(base)
    expect(text).toContain('short-lived, server-derived identifier')
    expect(text).not.toMatch(/calendar month|never recognised/)
  })

  it('keeps the sentence inside the second paragraph, before the documentation link', () => {
    const text = generatePrivacySnippet({ ...base, identity_window_days: 7 })
    const [p1, p2] = text.split('\n\n')
    expect(p1).not.toContain('at most 7 days')
    expect(p2.indexOf('at most 7 days')).toBeLessThan(p2.indexOf("Pulse's documentation"))
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
    expect(p1).toBe(
      'We use Pulse to understand how visitors use our site. Ciphera does not use cookies or other persistent identifiers. A cookie consent banner is not required for Pulse.',
    )
  })

  it('never mentions Global Privacy Control — GPC has no policy sentence here', () => {
    const text = generatePrivacySnippet({ ...base, respect_gpc: false })
    expect(text).not.toMatch(/Global Privacy Control|GPC/)
  })
})
