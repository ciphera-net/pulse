import { describe, expect, it } from 'vitest'
import { getIntegration, integrations } from '@/lib/integrations'
import { choicesFrom, featuresPayload, trackingScript } from '@/lib/tracking-script'

const PLAIN = '<script defer data-domain="example.com" src="https://js.ciphera.net/script.js"></script>'

describe('the tracking script builder', () => {
  it('prints the plain tag', () => {
    expect(trackingScript('example.com', undefined)).toBe(PLAIN)
  })

  // * Tracker v1.9.0 (14-11-2026) takes every option from the site's saved settings, so the tag never carries one:
  // * no data-no-*, no data-ignore-*, no companion line. A choice that changed the text would send the owner back
  // * to their site to paste it again, which is the hassle this removed.
  it('writes no option of any kind into the tag', () => {
    const text = trackingScript('example.com', undefined)
    expect(text).not.toMatch(/data-no-|data-ignore-|script\.interactions/)
    expect(text.split('\n')).toHaveLength(1)
  })

  it("uses a platform's own wiring, with no flags and no companion line", () => {
    const next = getIntegration('nextjs')
    expect(next?.snippet?.code).toBeTruthy()
    const wired = trackingScript('example.com', next)
    expect(wired).not.toMatch(/^<script defer data-domain/)
    expect(wired).toContain('example.com')
    expect(wired).not.toMatch(/data-no-|data-ignore-|noScroll|noOutbound|noDownloads|script\.interactions/)
  })

  it('every platform snippet in the registry comes out without options', () => {
    for (const integration of integrations) {
      if (!integration.snippet?.code) continue
      const text = trackingScript('example.com', integration)
      expect(text, integration.id).not.toMatch(/data-no-|data-ignore-|script\.interactions|PULSE_FLAGS/)
    }
  })

  it('cuts the domain to hostname characters, so a quote cannot leave data-domain', () => {
    const text = trackingScript('evil.com" src="https://attacker.example/x.js', undefined)
    expect(text).toBe('<script defer data-domain="evil.comsrchttpsattacker.examplex.js" src="https://js.ciphera.net/script.js"></script>')
  })
})

describe("the site's settings the pages edit", () => {
  it('a site with nothing stored: every feature on, interactions off, both signals respected', () => {
    expect(choicesFrom(undefined)).toEqual({
      features: { scroll: true, outbound: true, downloads: true },
      interactions: false,
      kinds: { clicks: true, copy: true, forms: true },
      respectDnt: true,
      respectGpc: true,
    })
  })

  it('reports the keys it owns, for a merge over the stored object', () => {
    expect(featuresPayload(choicesFrom({ storage: 'session', scroll: false }))).toEqual({
      scroll: false, outbound: true, downloads: true, interactions: false, clicks: true, copy: true, forms: true,
    })
  })

  // The version lock (Subresource Integrity) was removed on 07-11-2026. A site that saved General before then still
  // carries `sri` in script_features, sometimes true: nothing reads it, and a save must leave it as it was.
  it('never writes sri, so a merge leaves a stored one as it was and nothing reads it', () => {
    const stored = { sri: true, scroll: true }
    const merged = { ...stored, ...featuresPayload(choicesFrom(stored)) }
    expect(merged.sri).toBe(true)
    expect(Object.keys(featuresPayload(choicesFrom(stored)))).not.toContain('sri')
    expect('sri' in choicesFrom(stored)).toBe(false)
  })
})
