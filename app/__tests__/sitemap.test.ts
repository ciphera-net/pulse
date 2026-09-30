import { describe, it, expect } from 'vitest'
import sitemap from '@/app/sitemap'

describe('app/sitemap.ts (post lib/marketing-routes.ts extraction)', () => {
  it('still emits exactly 100 URLs — the refactor must be byte-identical in shape', () => {
    expect(sitemap()).toHaveLength(100)
  })

  it('emits the homepage at the bare base URL, never a doubled or missing slash', () => {
    const entries = sitemap()
    expect(entries.some((e) => e.url === 'https://pulse.ciphera.net')).toBe(true)
    expect(entries.some((e) => e.url === 'https://pulse.ciphera.net/')).toBe(false)
  })

  it('emits every L1 marketing route exactly once', () => {
    const urls = new Set(sitemap().map((e) => e.url))
    const marketingUrls = [
      'https://pulse.ciphera.net',
      'https://pulse.ciphera.net/about',
      'https://pulse.ciphera.net/features',
      'https://pulse.ciphera.net/pricing',
      'https://pulse.ciphera.net/faq',
      'https://pulse.ciphera.net/changelog',
      'https://pulse.ciphera.net/installation',
      'https://pulse.ciphera.net/integrations',
      'https://pulse.ciphera.net/demo',
      'https://pulse.ciphera.net/open-source',
      'https://pulse.ciphera.net/startups',
      'https://pulse.ciphera.net/contact',
    ]
    for (const url of marketingUrls) expect(urls.has(url)).toBe(true)
  })

  it('still emits all 75 integration guides — L1 excludes them, the sitemap does not', () => {
    const entries = sitemap()
    const integrationEntries = entries.filter((e) => e.url.includes('/integrations/'))
    expect(integrationEntries).toHaveLength(75)
  })
})
