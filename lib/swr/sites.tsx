import { useCallback } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { listSites, getSitesOverview, listDeletedSites, type Site, type SiteOverview } from '@/lib/api/sites'
import { FAVICON_SERVICE_URL } from '@/lib/utils/favicon'
import { usePendingKeys } from '@/lib/hold/pending'

// Exported (PUL-28): a site deletion commits through the global Undo bar, so
// the commit's refresh has to reach these caches from wherever it runs, not
// only from a mounted useSites()/useDeletedSites(). See useRefreshSiteLists.
export const SITES_KEY = 'sites'
export const DELETED_SITES_KEY = 'deleted-sites'
const SITES_OVERVIEW_KEY = 'sites-overview'

export function useSites() {
  const { data, error, isLoading, mutate } = useSWR<Site[]>(
    SITES_KEY,
    () => listSites(),
    {
      revalidateOnFocus: false,
      dedupingInterval: 30_000,
    }
  )

  // A site whose deletion is waiting behind the Undo bar (PUL-28) is hidden
  // from every list built on this hook at once: the fleet, the site switcher,
  // the command palette. Nothing is sent until the window runs out; see
  // useDeferredRemoval and DeleteSiteModal.
  const pendingKeys = usePendingKeys()
  const sites = (data ?? []).filter((s) => !pendingKeys.has(`site:${s.id}`))

  return {
    sites,
    isLoading,
    error,
    mutate,
  }
}

/**
 * The home page's "Scheduled for deletion" list. Separate from `useSites()`
 * (and its own pending key, `deleted-site:<id>`) because a site already in
 * this list is already absent from the active one: permanently deleting it
 * from here must hide THIS row, not a row in the fleet that was never there.
 */
export function useDeletedSites() {
  const { data, error, isLoading, mutate } = useSWR<Site[]>(
    DELETED_SITES_KEY,
    () => listDeletedSites(),
    {
      revalidateOnFocus: false,
    }
  )

  const pendingKeys = usePendingKeys()
  const deletedSites = (data ?? []).filter((s) => !pendingKeys.has(`deleted-site:${s.id}`))

  return {
    deletedSites,
    isLoading,
    error,
    mutate,
  }
}

/**
 * Revalidates both site lists from ANY component inside the app's
 * SWRProvider (the bound-`mutate` reasoning is `useSitesCache`'s, just below).
 * A confirmed site deletion changes both lists regardless of which one its
 * trigger lived on: a soft delete moves the site from active to scheduled,
 * and a permanent delete removes it from whichever one it was in. Chosen
 * over an event bus as the simplest robust option, because SWR's own cache
 * is already the shared channel every mounted list reads, so a page that is
 * not mounted when the commit happens just sees fresh data the next time it
 * mounts.
 */
export function useRefreshSiteLists(): () => Promise<void> {
  const { mutate } = useSWRConfig()
  // Resolves when BOTH refetches have landed: a deferred deletion shows its
  // item again only after this (whilePending), so returning early would let
  // the deleted site flash back into the list while the refetch is in flight.
  return useCallback(async () => {
    await Promise.all([mutate(SITES_KEY), mutate(DELETED_SITES_KEY)])
  }, [mutate])
}

/**
 * The list with `site` in it exactly once: replaced in place when its id is
 * already there (the server's row wins), appended when it is not. Pure, so the
 * cache write below is testable without SWR.
 */
export function upsertSite(list: Site[] | undefined, site: Site): Site[] {
  const current = list ?? []
  const at = current.findIndex((s) => s.id === site.id)
  if (at === -1) return [...current, site]
  const next = current.slice()
  next[at] = site
  return next
}

/**
 * Writes to the sites list cache from ANY component inside the app's
 * SWRProvider — no mounted `useSites()` required.
 *
 * 🔴 BOUND MUTATE ONLY. `components/SWRProvider.tsx` mounts SWRConfig with a
 * custom cache provider, and the global `mutate` imported from 'swr' addresses
 * the DEFAULT cache — a cache nothing in this app reads, with its own request
 * markers and its own (empty) list of hooks to revalidate. The `mutateSites()`
 * that used to live here was exactly that call, so it was a silent no-op.
 * Measured on the owner's fresh account, 11-09-2026: the wizard's site step
 * cached `[]` on mount, `mutateSites()` "revalidated" the wrong cache, the
 * fleet mounted inside useSites' 30 s dedupe window and showed "No sites yet"
 * until a refresh. Same trap as the org-switch purge (`lib/swr/org-switch.ts`,
 * pulse#412 → #413). Never import `mutate` from 'swr' in this repo.
 */
export function useSitesCache() {
  const { mutate } = useSWRConfig()

  /**
   * Put a site the server just created into the list. Synchronous: every
   * `useSites()` reader — the fleet, the sidebar switcher, the install banner
   * on the site's own dashboard, the wizard's resume view and stepper — sees
   * it on the next render, and a `useSites()` mounted later inside the 30 s
   * dedupe window reads it from the cache.
   *
   * The row written is the POST's own response, which IS the server's row,
   * so no refetch follows (`revalidate: false`). A refetch here was tried and
   * reviewed out: it bought nothing the row does not already carry, and it
   * opened two races — a stale answer (the API client's 2 s response cache, a
   * GET still in flight from a hook's mount) could replace the list with a
   * snapshot that predates the site, and two quick additions could have the
   * later one's snapshot drop the earlier one's site, because SWR commits only
   * the newest in-flight mutation on a key. A plain write has neither problem
   * and composes: two additions in a row leave both sites in the list. SWR's
   * normal revalidation keeps the list honest from here, exactly as before.
   *
   * The fleet overview key is invalidated too, so the deck does not spend the
   * overview's dedupe window with the new site's card missing.
   */
  const addSite = useCallback(
    (site: Site): Promise<Site[] | undefined> => {
      const written = mutate<Site[]>(SITES_KEY, (current) => upsertSite(current, site), {
        revalidate: false,
      })
      void mutate(SITES_OVERVIEW_KEY)
      return written
    },
    [mutate],
  )

  return { addSite }
}

/**
 * Batched fleet overview for the Your Sites deck — one request for every
 * accessible site's today-visitors / 7-day series / install / uptime status,
 * replacing the former per-site stats fan-out. `overviewError` is surfaced so
 * cards render a visible error, never a fabricated zero. The 30s dedupe
 * matches the server's private-cache TTL on the endpoint.
 */
export function useSitesOverview() {
  const { data, error, isLoading, mutate } = useSWR<SiteOverview[]>(
    SITES_OVERVIEW_KEY,
    () => getSitesOverview(),
    {
      revalidateOnFocus: false,
      dedupingInterval: 30_000,
    }
  )

  const bySite: Record<string, SiteOverview> = {}
  for (const entry of data ?? []) bySite[entry.site_id] = entry

  return {
    overviewBySite: bySite,
    overviewError: error as Error | undefined,
    isLoading,
    mutate,
  }
}

/** Preload favicon images into browser cache */
export function FaviconPreloader({ sites }: { sites: Site[] }) {
  if (sites.length === 0) return null
  return (
    <div className="hidden" aria-hidden="true">
      {sites.map(site => (
        <img
          key={site.id}
          src={`${FAVICON_SERVICE_URL}?domain=${site.domain}&sz=64`}
          alt=""
          width={1}
          height={1}
        />
      ))}
    </div>
  )
}
