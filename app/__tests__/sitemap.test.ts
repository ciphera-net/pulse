import { describe, it, expect, vi, afterEach } from 'vitest'
import type { RouteSeo } from '@/lib/seo'

// lib/seo.ts re-exports `routeSeo` straight from the git-ignored
// lib/seo.gen.ts (built by `npm run generate:seo`, which always runs before
// tests in CI — see .woodpecker/test.yml). Mocking `@/lib/seo` here lets the
// noindex/sitemap-agreement tests below control that map directly, instead of
// depending on a generated file being present for a plain local `vitest run`.
// `vi.mock(...)` is hoisted above every other statement in this file
// (including a plain `const`), so the object the factory closes over must
// come from `vi.hoisted` or the factory runs against a not-yet-initialized
// binding.
const { mockRouteSeo } = vi.hoisted(() => ({ mockRouteSeo: {} as Record<string, RouteSeo> }))
vi.mock('@/lib/seo', () => ({ routeSeo: mockRouteSeo }))

function stub(overrides: Partial<RouteSeo> = {}): RouteSeo {
  return {
    title: 'Stub title',
    description: 'Stub description',
    canonical: '',
    ogTitle: '',
    ogDescription: '',
    ogImage: '',
    twitterTitle: '',
    twitterDescription: '',
    noindex: false,
    nofollow: false,
    modified: '',
    ...overrides,
  }
}

import sitemap from '@/app/sitemap'

describe('app/sitemap.ts (post lib/marketing-routes.ts extraction)', () => {
  afterEach(() => {
    for (const key of Object.keys(mockRouteSeo)) delete mockRouteSeo[key]
  })

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

  // Design §4.5: a stub with noindex must both set the page noindex (lib/seo.ts's
  // seoFor) AND drop the URL here, or the site contradicts itself to crawlers.
  describe('robots/sitemap agreement (design §4.5)', () => {
    it('drops a noindexed static route from the sitemap', () => {
      mockRouteSeo['/about'] = stub({ noindex: true })
      const urls = sitemap().map((e) => e.url)
      expect(urls).not.toContain('https://pulse.ciphera.net/about')
      // every other static route is untouched
      expect(urls).toContain('https://pulse.ciphera.net')
      expect(sitemap()).toHaveLength(99)
    })

    it('drops a noindexed comparison/category/tool route from the sitemap', () => {
      mockRouteSeo['/cookieless-analytics'] = stub({ noindex: true })
      const urls = sitemap().map((e) => e.url)
      expect(urls).not.toContain('https://pulse.ciphera.net/cookieless-analytics')
    })

    it('drops the homepage itself when its stub sets noindex', () => {
      mockRouteSeo['/'] = stub({ noindex: true })
      const urls = sitemap().map((e) => e.url)
      expect(urls).not.toContain('https://pulse.ciphera.net')
    })

    it('keeps a route whose stub sets nofollow only (nofollow narrows crawl, not the index)', () => {
      mockRouteSeo['/about'] = stub({ nofollow: true })
      const urls = sitemap().map((e) => e.url)
      expect(urls).toContain('https://pulse.ciphera.net/about')
    })

    it('leaves the /integrations/[slug] guides alone even when /integrations itself is noindexed', () => {
      mockRouteSeo['/integrations'] = stub({ noindex: true })
      const entries = sitemap()
      expect(entries.some((e) => e.url === 'https://pulse.ciphera.net/integrations')).toBe(false)
      expect(entries.filter((e) => e.url.includes('/integrations/'))).toHaveLength(75)
    })

    it('overrides lastModified with the stub\'s own modifiedGmt when present', () => {
      mockRouteSeo['/about'] = stub({ modified: '2026-09-30T12:00:00Z' })
      const entry = sitemap().find((e) => e.url === 'https://pulse.ciphera.net/about')
      expect(entry?.lastModified).toEqual(new Date('2026-09-30T12:00:00Z'))
    })

    it('keeps the hardcoded lastModified when a stub exists but sets no modifiedGmt', () => {
      mockRouteSeo['/about'] = stub({ modified: '' })
      const entry = sitemap().find((e) => e.url === 'https://pulse.ciphera.net/about')
      expect(entry?.lastModified).toEqual(new Date('2026-07-21'))
    })
  })
})
