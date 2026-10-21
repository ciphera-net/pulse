// * Which site reads a page may make, and how (PUL-34 Phase 2, design
// * Pulse/docs/plans/20-10-2026-pulse-demo-real-app-design.md §3.2).
// *
// * The product's pages, /demo and /share/<id> render the SAME components, so every data hook has to
// * work under three kinds of scope (lib/scope/SiteScope.tsx): a member's, the sample site's, and a
// * site's own share link. What a scope may read is decided here, once, instead of in every card:
// *
// *  - HOW a read goes out: the hook resolves a SiteRef from the nearest scope (useSiteRef), so a public
// *    scope reads /public/sites/<id>/<same path> and anything else reads exactly what it always did.
// *  - WHETHER it goes out at all: the route class below against the scope's mode and fidelity. A read the
// *    scope may not make is not made; the hook says so (`available: false`) instead of answering with an
// *    empty payload or an error, because a card that is not available is not "empty" and not "failed".

import useSWR, { type Arguments, type SWRConfiguration, type SWRResponse } from 'swr'
import { useOptionalSiteScope, useSiteRef, type SiteScope } from '@/lib/scope/SiteScope'
import { isPublicSiteRef, siteRefKey, type SiteRef } from '@/lib/scope/site-ref'

/**
 * Which surface answers a read, by the backend's public route table (pulse-backend
 * internal/api/public_share_routes.go).
 *
 *  - `customer`: the five routes every share link is served, public-scoped (fixed day-granular
 *    periods, no filters, no sub-day buckets): `/stats`, `/daily`, `/realtime`,
 *    `/dashboard` and `/page-preview`.
 *  - `demo`: every other public route. Only the demo site is served these, at full fidelity; a share link
 *    answers 404 "This page is not shared" until the Sharing round (D10) rules on each page. That includes
 *    the site record itself (`/sites/:id`) and the data window.
 *  - `member`: no public route exists (install status, ingest health, traffic status, quarantine, the
 *    site team, billing, Visitors, every write). Never made from a public scope, whatever its fidelity.
 */
export type SiteRouteClass = 'customer' | 'demo' | 'member'

/**
 * The availability rule, as a pure function (the hooks below and the tests call this one).
 *
 *  - No scope, or a member scope: every read is available, as a member read.
 *  - A public scope: only a read of the scope's OWN site, through a public ref, is a public read. Anything
 *    else (a member-class read, or a read of another site, which could only go out as a member read) is
 *    never made from a public page.
 *      - `full` fidelity (the demo): `customer` and `demo` reads.
 *      - `scoped` fidelity (a share link): `customer` reads only.
 *
 * `ref` is null for a read with no site (the subscription).
 */
export function siteReadAvailable(scope: SiteScope | null, ref: SiteRef | null, routeClass: SiteRouteClass): boolean {
  if (!scope || scope.mode !== 'public') return true
  if (ref === null || !isPublicSiteRef(ref)) return false
  if (routeClass === 'member') return false
  if (routeClass === 'customer') return true
  return scope.fidelity === 'full'
}

export interface SiteRead {
  /** The read for this site under the nearest scope: a public ref only under a public scope for it. */
  ref: SiteRef
  /** The id part of an SWR key: the plain id for a member read (so member keys never move), `public:<id>` otherwise. */
  siteKey: string
  /** False when the scope may not make this kind of read at all: no request is made, and none should be drawn. */
  available: boolean
}

/** Resolves how `siteId` is read under the nearest scope, and whether this class of read may be made. */
export function useSiteRead(siteId: string | undefined, routeClass: SiteRouteClass): SiteRead {
  const ref = useSiteRef(siteId ?? '')
  const scope = useOptionalSiteScope()
  return { ref, siteKey: siteRefKey(ref), available: siteReadAvailable(scope, ref, routeClass) }
}

/**
 * What every site hook returns: the SWR response, plus whether the read is one the scope may make.
 *
 * When `available` is false the hook has made no request, and `data`, `error`, `isLoading` and
 * `isValidating` are undefined, undefined, false and false. That is NOT "loading" and NOT "no rows": the
 * caller must not draw the card as either. Check `available === false` (not `!available`) so a test that
 * mocks a hook without the field keeps working.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SiteSWRResponse<Data> = SWRResponse<Data, any> & { available: boolean }

/**
 * Adds `available` to an SWR response without disturbing it.
 *
 * The getters forward instead of copying. SWR's response is a set of lazy getters, and each one a
 * component reads is what subscribes it to that part of the state; spreading the response would read all
 * four, and every component using `{ data }` alone would re-render on every revalidation's isValidating flip.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withAvailability<Data>(swr: SWRResponse<Data, any>, available: boolean): SiteSWRResponse<Data> {
  if (!available) {
    return { data: undefined, error: undefined, isValidating: false, isLoading: false, mutate: swr.mutate, available: false }
  }
  return {
    get data() { return swr.data },
    get error() { return swr.error },
    get isValidating() { return swr.isValidating },
    get isLoading() { return swr.isLoading },
    mutate: swr.mutate,
    available: true,
  } as SiteSWRResponse<Data>
}

/**
 * useSWR for a site read under the nearest scope. Every site hook goes through this.
 *
 * `buildKey` receives `siteKey` where the hook's key used to hold the site id, and returns null while the
 * hook has what it needs to wait for (a withheld range, a closed modal). It is not called when the read is
 * not available. A member read's key is therefore exactly what it was before the scope existed:
 * mutate(['funnels', siteId]) and the like keep matching.
 */
export function useSiteSWR<Data>(
  siteId: string | undefined,
  routeClass: SiteRouteClass,
  buildKey: (siteKey: string, ref: SiteRef) => Arguments,
  fetcher: (ref: SiteRef) => Promise<Data>,
  config?: SWRConfiguration<Data>,
): SiteSWRResponse<Data> {
  const { ref, siteKey, available } = useSiteRead(siteId, routeClass)
  const swr = useSWR<Data>(available ? buildKey(siteKey, ref) : null, () => fetcher(ref), config)
  return withAvailability(swr, available)
}
