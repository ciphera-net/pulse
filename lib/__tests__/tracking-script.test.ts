import { describe, expect, it } from 'vitest'
import { getIntegration } from '@/lib/integrations'
import { choicesFrom, coreFlags, featuresPayload, interactionFlags, trackingScript } from '@/lib/tracking-script'

describe('the tracking script builder', () => {
  it('a site with nothing stored gets the plain tag: every feature on, both signals respected', () => {
    expect(trackingScript('example.com', undefined, choicesFrom(undefined))).toBe(
      '<script defer data-domain="example.com" src="https://js.ciphera.net/script.js"></script>',
    )
  })

  it('writes the switched-off features, then the ignored signals, in that order', () => {
    const c = choicesFrom({ scroll: false, downloads: false }, false, false)
    expect(coreFlags(c)).toEqual(['data-no-scroll', 'data-no-downloads', 'data-ignore-dnt', 'data-ignore-gpc'])
    expect(trackingScript('example.com', undefined, c)).toBe(
      '<script defer data-domain="example.com" data-no-scroll data-no-downloads data-ignore-dnt data-ignore-gpc src="https://js.ciphera.net/script.js"></script>',
    )
  })

  it('adds the companion line only when it is on, with its own opt-outs and no domain', () => {
    expect(interactionFlags(choicesFrom({}))).toBeNull()
    const c = choicesFrom({ interactions: true, copy: false })
    expect(interactionFlags(c)).toEqual(['data-no-copy'])
    const [, second] = trackingScript('example.com', undefined, c).split('\n')
    expect(second).toBe('<script defer data-no-copy src="https://js.ciphera.net/script.interactions.js"></script>')
  })

  // The version lock (Subresource Integrity) was removed on 07-11-2026. A site that saved General before then still
  // carries `sri` in script_features, sometimes true: it must change nothing in the copied script.
  it('ignores a stored sri key: the rolling files, no integrity, for the core and the companion', () => {
    expect(trackingScript('example.com', undefined, choicesFrom({ sri: true, interactions: true }))).toBe(
      '<script defer data-domain="example.com" src="https://js.ciphera.net/script.js"></script>\n' +
        '<script defer src="https://js.ciphera.net/script.interactions.js"></script>',
    )
  })

  it("uses a platform's own wiring, whatever a stored sri key says", () => {
    const next = getIntegration('nextjs')
    expect(next?.snippet?.code).toBeTruthy()
    const wired = trackingScript('example.com', next, choicesFrom({}))
    expect(wired).not.toMatch(/^<script defer data-domain/)
    expect(wired).toContain('example.com')
    expect(trackingScript('example.com', next, choicesFrom({ sri: true }))).toBe(wired)
  })

  it('cuts the domain to hostname characters, so a quote cannot leave data-domain', () => {
    const text = trackingScript('evil.com" src="https://attacker.example/x.js', undefined, choicesFrom({}))
    expect(text).toBe('<script defer data-domain="evil.comsrchttpsattacker.examplex.js" src="https://js.ciphera.net/script.js"></script>')
  })

  it('reports the keys it owns, for a merge over the stored object', () => {
    expect(featuresPayload(choicesFrom({ storage: 'session', scroll: false }))).toEqual({
      scroll: false, outbound: true, downloads: true, interactions: false, clicks: true, copy: true, forms: true,
    })
  })

  it('never writes sri, so a merge leaves a stored one as it was and nothing reads it', () => {
    const stored = { sri: true, scroll: true }
    const merged = { ...stored, ...featuresPayload(choicesFrom(stored)) }
    expect(merged.sri).toBe(true)
    expect(Object.keys(featuresPayload(choicesFrom(stored)))).not.toContain('sri')
    expect('sri' in choicesFrom(stored)).toBe(false)
  })
})
