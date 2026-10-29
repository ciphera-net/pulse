import { describe, expect, it } from 'vitest'
import { COMPARISON_LOGO_BASE, comparisonLogoUrl } from '../comparisonLogos'
import { SOURCE_DISPLAY } from '../import/source-display'

describe('comparisonLogoUrl', () => {
  it('writes the slug in hex', () => {
    // AdGuard Tracking Protection's `/google-analytics.` hid this logo while its file carried the name.
    expect(comparisonLogoUrl('google-analytics')).toBe(
      'https://cdn.ciphera.net/website/blog/tools/_676f6f676c652d616e616c7974696373.png'
    )
    expect(comparisonLogoUrl('umami')).toBe(`${COMPARISON_LOGO_BASE}/_756d616d69.png`)
  })

  it('never carries the name, for every logo the import tab draws', () => {
    const slugs = Object.values(SOURCE_DISPLAY).map((s) => s.logoSlug)
    expect(slugs.length).toBeGreaterThan(0)
    for (const slug of slugs) {
      const file = comparisonLogoUrl(slug).slice(COMPARISON_LOGO_BASE.length + 1)
      expect(file).toMatch(/^_[0-9a-f]+\.png$/)
      expect(file).not.toContain(slug)
    }
  })

  it('encodes UTF-8 bytes, as the uploaded file names do', () => {
    expect(comparisonLogoUrl('é')).toBe(`${COMPARISON_LOGO_BASE}/_c3a9.png`)
  })
})
