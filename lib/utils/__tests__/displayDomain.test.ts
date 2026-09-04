import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { displayDomain, siteMatchesQuery } from '../displayDomain'

const REPO = join(__dirname, '..', '..', '..')
/** Strip comments so a guard matches CODE, not a sentence about the code. */
function code(rel: string): string {
  return readFileSync(join(REPO, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('displayDomain', () => {
  it('prefers the server-computed caption', () => {
    expect(displayDomain({ domain: 'xn--mller-kva.de', display_domain: 'müller.de' })).toBe('müller.de')
  })

  it('falls back to the stored domain when there is no caption', () => {
    expect(displayDomain({ domain: 'example.com' })).toBe('example.com')
    expect(displayDomain({ domain: 'xn--mller-kva.de' })).toBe('xn--mller-kva.de')
  })

  it('falls back when the caption is empty rather than rendering nothing', () => {
    expect(displayDomain({ domain: 'example.com', display_domain: '' })).toBe('example.com')
  })
})

describe('siteMatchesQuery', () => {
  const site = { domain: 'xn--mller-kva.de', display_domain: 'müller.de', name: 'Müller' }

  it('matches what the user actually reads on screen', () => {
    expect(siteMatchesQuery(site, 'müller')).toBe(true)
  })

  it('still matches the stored punycode', () => {
    expect(siteMatchesQuery(site, 'xn--mller')).toBe(true)
  })

  it('does not match an unrelated term', () => {
    expect(siteMatchesQuery(site, 'example')).toBe(false)
  })

  it('an empty query matches everything', () => {
    expect(siteMatchesQuery(site, '  ')).toBe(true)
  })
})

// 🔴 The catastrophic case. ScriptSetupBlock builds the install snippet with
// `site.domain.replace(/[^a-zA-Z0-9.-]/g, '')` — a STRIP filter, not a reject.
// Fed a decoded "müller.de" it emits data-domain="mller.de": a valid-looking
// hostname that matches nothing, forever, with no error anywhere. The snippet
// must read the stored value.
describe('the install snippet must never use the caption', () => {
  it('ScriptSetupBlock builds its snippet from site.domain, not displayDomain', () => {
    const src = code('components/sites/ScriptSetupBlock.tsx')
    expect(src).toMatch(/site\.domain/)
    expect(src).not.toMatch(/displayDomain/)
  })

  it('the favicon proxy and outbound links use the stored domain', () => {
    for (const f of ['components/sites/SiteFavicon.tsx', 'components/dashboard/ContentStats.tsx']) {
      expect(code(f), `${f} must not render the caption into a URL`).not.toMatch(/displayDomain/)
    }
  })

  it('type-to-confirm gates keep comparing the stored domain', () => {
    // Showing a caption the user then cannot type would make the site
    // undeletable and the data unresettable.
    for (const f of ['components/sites/DeleteSiteModal.tsx', 'components/settings/unified/ResetDataModal.tsx']) {
      expect(code(f), `${f} must not use the caption in a confirmation gate`).not.toMatch(/displayDomain/)
    }
  })
})
