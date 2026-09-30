import { describe, it, expect, vi, afterEach } from 'vitest'
import type { RouteSeo } from '@/lib/seo'

// lib/seo.ts imports `routeSeo` straight from the git-ignored lib/seo.gen.ts
// (built by `npm run generate:seo`). Mock the generated module directly so
// this file exercises seoFor()'s merge logic without depending on a real
// generator run. `vi.mock(...)` is hoisted above every other statement in
// this file, so the object the factory closes over must come from
// `vi.hoisted` or the factory runs against a not-yet-initialized binding.
const { mockRouteSeo } = vi.hoisted(() => ({ mockRouteSeo: {} as Record<string, RouteSeo> }))
vi.mock('@/lib/seo.gen', () => ({
  routeSeo: mockRouteSeo,
  SEO_ROUTE_COUNT: 0,
  SEO_WATERMARK: '',
  SEO_OVERRIDE: false,
}))

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

const { seoFor, seoForRoute } = await import('@/lib/seo')

describe('seoFor (design §4)', () => {
  afterEach(() => {
    for (const key of Object.keys(mockRouteSeo)) delete mockRouteSeo[key]
  })

  it('returns the fallback untouched when the route has no stub', () => {
    const fallback = { title: 'Fallback', description: 'Fallback description' }
    expect(seoFor('/no-stub', fallback)).toBe(fallback)
  })

  it('renders the stub title as an absolute string, never a bare one', () => {
    mockRouteSeo['/about'] = stub({ title: 'About — CMS title' })
    const merged = seoFor('/about', { title: 'About' })
    expect(merged.title).toEqual({ absolute: 'About — CMS title' })
  })

  // Regression: a layout that re-declares its own `title.template` for its
  // children (app/integrations/layout.tsx, for the 75 /integrations/[slug]
  // guides) must keep that template live even when a stub overrides its own
  // title — see resolve-title.js: a segment only forwards ITS OWN resolved
  // `title.template` to descendants, not the nearest ancestor's. Replacing the
  // whole title object with a bare `{ absolute }` would silently strip the
  // template from every descendant title.
  it('carries a fallback title.template forward when the stub sets a title', () => {
    mockRouteSeo['/integrations'] = stub({ title: 'Integrations — CMS title' })
    const merged = seoFor('/integrations', {
      title: { default: 'Integrations', template: '%s | Pulse Analytics' },
    })
    expect(merged.title).toEqual({
      absolute: 'Integrations — CMS title',
      template: '%s | Pulse Analytics',
    })
  })

  it('does not invent a template for a fallback that never declared one', () => {
    mockRouteSeo['/about'] = stub({ title: 'About — CMS title' })
    const merged = seoFor('/about', { title: 'About' })
    expect(merged.title).not.toHaveProperty('template')
  })

  it('only narrows robots — a stub that sets neither flag leaves the fallback\'s own robots alone', () => {
    mockRouteSeo['/about'] = stub({ noindex: false, nofollow: false })
    const merged = seoFor('/about', { title: 'About', robots: { index: false } })
    expect(merged.robots).toEqual({ index: false })
  })

  it('sets robots when the stub flags noindex or nofollow', () => {
    mockRouteSeo['/about'] = stub({ noindex: true })
    const merged = seoFor('/about', { title: 'About' })
    expect(merged.robots).toEqual({ index: false, follow: true })
  })
})

describe('seoForRoute', () => {
  afterEach(() => {
    for (const key of Object.keys(mockRouteSeo)) delete mockRouteSeo[key]
  })

  it('returns undefined for a route with no stub', () => {
    expect(seoForRoute('/nope')).toBeUndefined()
  })

  it('returns the stub for a route that has one', () => {
    mockRouteSeo['/about'] = stub()
    expect(seoForRoute('/about')).toBe(mockRouteSeo['/about'])
  })
})
