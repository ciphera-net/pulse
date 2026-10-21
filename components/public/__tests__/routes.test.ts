import { describe, it, expect } from 'vitest'
import { resolvePublicRoute } from '@/components/public/routes'
import { SITE_PAGES } from '@/lib/scope/SiteScope'

// What the segments under /demo and /share/<id> name. Anything this refuses never reaches a
// page component: the router shows the not-shared state instead.
describe('resolvePublicRoute', () => {
  it('maps no segment to the dashboard', () => {
    expect(resolvePublicRoute([])).toEqual({ page: 'dashboard' })
  })

  it('maps each other page to itself', () => {
    for (const page of SITE_PAGES.filter((p) => p !== 'dashboard')) {
      expect(resolvePublicRoute([page]), page).toEqual({ page })
    }
  })

  it('maps funnels/<id> to one funnel', () => {
    expect(resolvePublicRoute(['funnels', 'f-1'])).toEqual({ page: 'funnels', funnelId: 'f-1' })
    expect(resolvePublicRoute(['funnels', 'a%20b'])).toEqual({ page: 'funnels', funnelId: 'a b' })
    // A malformed escape is left as typed rather than thrown.
    expect(resolvePublicRoute(['funnels', '100%'])).toEqual({ page: 'funnels', funnelId: '100%' })
  })

  it('refuses every write route', () => {
    expect(resolvePublicRoute(['funnels', 'new'])).toBeNull()
    expect(resolvePublicRoute(['funnels', 'f-1', 'edit'])).toBeNull()
    // `new` is refused after decoding too.
    expect(resolvePublicRoute(['funnels', '%6Eew'])).toBeNull()
  })

  it('refuses the pages that are never public, and anything it does not know', () => {
    for (const segments of [['visitors'], ['visitors', 'k'], ['settings'], ['unknown'], ['Funnels'], ['pagespeed']]) {
      expect(resolvePublicRoute(segments), segments.join('/')).toBeNull()
    }
  })

  it('has no /dashboard page: the dashboard is the base path itself', () => {
    expect(resolvePublicRoute(['dashboard'])).toBeNull()
  })

  it('refuses extra segments after a page', () => {
    expect(resolvePublicRoute(['pages', 'x'])).toBeNull()
    expect(resolvePublicRoute(['funnels', 'f-1', 'x', 'y'])).toBeNull()
  })
})
