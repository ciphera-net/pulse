import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { publicSiteRef, siteIdOf, sitePath, siteRefKey, isPublicSiteRef } from '@/lib/scope/site-ref'
import { SiteScopeProvider, memberScope, scopeHref, canWrite, servesPage, useSiteRef, useSiteScope, type SiteScope } from '@/lib/scope/SiteScope'

const ID = 'e6a95eb8-8edb-44d4-a4e2-c400aea174a4'

const publicScope: SiteScope = {
  siteId: ID, mode: 'public', basePath: '/demo', pages: ['dashboard', 'funnels'], demo: true, fidelity: 'full',
}

function withScope(scope: SiteScope | null) {
  function ScopeWrapper({ children }: { children: React.ReactNode }) {
    return scope ? <SiteScopeProvider scope={scope}>{children}</SiteScopeProvider> : <>{children}</>
  }
  return ScopeWrapper
}

describe('site-ref', () => {
  it('keeps a plain id a member read, unchanged', () => {
    expect(sitePath(ID, '/dashboard?period=7d')).toBe(`/sites/${ID}/dashboard?period=7d`)
    expect(sitePath(ID)).toBe(`/sites/${ID}`)
    expect(siteRefKey(ID)).toBe(ID)
    expect(isPublicSiteRef(ID)).toBe(false)
  })

  it('reads a public ref through the public surface, on the same path', () => {
    const ref = publicSiteRef(ID)
    expect(sitePath(ref, '/funnels/f1/stats')).toBe(`/public/sites/${ID}/funnels/f1/stats`)
    expect(sitePath(ref)).toBe(`/public/sites/${ID}`)
    expect(siteIdOf(ref)).toBe(ID)
  })

  it('never lets a public and a member read share a cache key', () => {
    expect(siteRefKey(publicSiteRef(ID))).not.toBe(siteRefKey(ID))
  })
})

describe('SiteScope', () => {
  it('links every page under the scope base path, the dashboard at the base itself', () => {
    expect(scopeHref(publicScope, 'dashboard')).toBe('/demo')
    expect(scopeHref(publicScope, 'funnels', '/f1')).toBe('/demo/funnels/f1')
    expect(scopeHref(memberScope(ID), 'cdn')).toBe(`/sites/${ID}/cdn`)
  })

  it('serves a member and the demo every page they list, and nothing to a share link but its own dashboard', () => {
    expect(servesPage(memberScope(ID), 'search')).toBe(true)
    expect(servesPage(publicScope, 'funnels')).toBe(true)
    // the demo serves only what it lists
    expect(servesPage(publicScope, 'cdn')).toBe(false)
    // a share link is public-scoped: the dashboard draws its own scoped mode and never asks
    const shareLink: SiteScope = { ...publicScope, basePath: '/share/x', demo: false, fidelity: 'scoped', pages: ['dashboard', 'search'] }
    expect(servesPage(shareLink, 'search')).toBe(false)
  })

  it('lets only a member write', () => {
    expect(canWrite(memberScope(ID))).toBe(true)
    expect(canWrite(publicScope)).toBe(false)
  })

  it('resolves a hook site to a public ref only under a public scope for that same site', () => {
    expect(renderHook(() => useSiteRef(ID), { wrapper: withScope(publicScope) }).result.current).toEqual(publicSiteRef(ID))
    expect(renderHook(() => useSiteRef(ID), { wrapper: withScope(memberScope(ID)) }).result.current).toBe(ID)
    expect(renderHook(() => useSiteRef(ID), { wrapper: withScope(null) }).result.current).toBe(ID)
    const other = 'b7f0d0b6-2b5f-4f5c-9a51-5d0c3f1b6b1a'
    expect(renderHook(() => useSiteRef(other), { wrapper: withScope(publicScope) }).result.current).toBe(other)
  })

  it('keeps the ref stable across renders', () => {
    const { result, rerender } = renderHook(() => useSiteRef(ID), { wrapper: withScope(publicScope) })
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })

  it('refuses a surface rendered outside any scope', () => {
    expect(() => renderHook(() => useSiteScope())).toThrow(/no SiteScopeProvider/)
  })
})
