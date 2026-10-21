'use client'

import { createContext, useContext, useMemo } from 'react'
import { publicSiteRef, type SiteRef } from '@/lib/scope/site-ref'

/**
 * One provider says which site a page shows and how it is read (PUL-34 Phase 2,
 * design Pulse/docs/plans/20-10-2026-pulse-demo-real-app-design.md §3.2).
 *
 * The product's site pages, /demo and /share/<id> render the SAME page components
 * (components/surfaces/*). Those components never read the site from `useParams()` or
 * the path: they read it from this scope, so a route tree decides once whether a page is
 * a member's view or the public one, and a page added later cannot forget to.
 *
 *  - `/sites/<id>/**` provides member scope (app/sites/[id]/SiteLayoutShell.tsx).
 *  - `/demo/**` and `/share/<id>/**` provide public scope, resolved from the API.
 */

/** Every page a site can show publicly, in the backend's spelling (internal/api/public_share.go). */
export const SITE_PAGES = ['dashboard', 'pages', 'journeys', 'funnels', 'performance', 'uptime', 'search', 'cdn'] as const
export type SitePage = (typeof SITE_PAGES)[number]

export function isSitePage(value: string): value is SitePage {
  return (SITE_PAGES as readonly string[]).includes(value)
}

/**
 * How the API answers this scope.
 *  - `full`: exactly as a member sees it: filters, any range, every interval. A member,
 *    and the demo site (synthetic data, the gate's full-fidelity rule).
 *  - `scoped`: a customer's share link, a public-scoped read: fixed day-granular periods
 *    only, no filters, no hourly buckets (pulse-backend public_surface.go; there is no
 *    five-visitor floor since 21-10-2026). Pages must not ask it for more.
 */
export type ScopeFidelity = 'full' | 'scoped'

export interface SiteScope {
  siteId: string
  mode: 'member' | 'public'
  /** Where this site's pages live: `/sites/<id>`, `/demo` or `/share/<id>`. */
  basePath: string
  /** The pages this scope may show: every page for a member; the site's shared pages in public. */
  pages: readonly SitePage[]
  /** The sample site (`is_demo`): labelled as sample data on every view. */
  demo: boolean
  fidelity: ScopeFidelity
}

export function memberScope(siteId: string): SiteScope {
  return { siteId, mode: 'member', basePath: `/sites/${siteId}`, pages: SITE_PAGES, demo: false, fidelity: 'full' }
}

/**
 * The link to one of this scope's pages. `rest` follows the page segment (`/<funnelId>`,
 * `?period=7`). The dashboard is the base path itself.
 */
export function scopeHref(scope: Pick<SiteScope, 'basePath'>, page: SitePage, rest = ''): string {
  return page === 'dashboard' ? `${scope.basePath}${rest}` : `${scope.basePath}/${page}${rest}`
}

/**
 * Whether this scope shows `page`: the one rule every surface's gate asks, before any of its hooks run. A member sees
 * every page; a public scope only the pages its site shares, at full fidelity. A customer's share link is public-scoped
 * and is served the dashboard alone, which draws its scoped mode itself and never asks this.
 */
export function servesPage(scope: Pick<SiteScope, 'fidelity' | 'pages'>, page: SitePage): boolean {
  return scope.fidelity === 'full' && scope.pages.includes(page)
}

/** Whether this scope may change anything. Write controls are absent, not disabled, when it may not. */
export function canWrite(scope: Pick<SiteScope, 'mode'>): boolean {
  return scope.mode === 'member'
}

const SiteScopeContext = createContext<SiteScope | null>(null)

export function SiteScopeProvider({ scope, children }: { scope: SiteScope; children: React.ReactNode }) {
  return <SiteScopeContext.Provider value={scope}>{children}</SiteScopeContext.Provider>
}

/** The scope of the page being rendered. Every surface component sits under a provider. */
export function useSiteScope(): SiteScope {
  const scope = useContext(SiteScopeContext)
  if (!scope) throw new Error('useSiteScope: no SiteScopeProvider above this component')
  return scope
}

/** The scope if there is one: the shell and the data hooks also render outside a site. */
export function useOptionalSiteScope(): SiteScope | null {
  return useContext(SiteScopeContext)
}

/**
 * How a data hook reads `siteId`: through the public surface when the nearest scope is a
 * public one for this same site, as a member otherwise (including outside any scope:
 * settings, the sites list). Stable across renders, so it can sit in a hook's deps.
 */
export function useSiteRef(siteId: string): SiteRef {
  const scope = useOptionalSiteScope()
  const isPublic = scope?.mode === 'public' && scope.siteId === siteId
  return useMemo(() => (isPublic ? publicSiteRef(siteId) : siteId), [isPublic, siteId])
}
