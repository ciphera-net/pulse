import { useCallback } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { listSites, getSitesOverview, type Site, type SiteOverview } from '@/lib/api/sites'
import { FAVICON_SERVICE_URL } from '@/lib/utils/favicon'

const SITES_KEY = 'sites'
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

  return {
    sites: data ?? [],
    isLoading,
    error,
    mutate,
  }
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
   * Put a site the server just created into the list, immediately, then
   * replace the list with a fresh read that is guaranteed to contain it.
   *
   * - `optimisticData` makes the site visible to every `useSites()` reader on
   *   the next render: the fleet, the sidebar switcher, the install banner on
   *   the site's own dashboard, the wizard's resume view and stepper.
   * - The refetch is the honest list (server order, every field). A fresh
   *   answer that already carries the site is taken as is; a stale one — the
   *   API client's 2 s response cache, a lagging read — cannot make a site
   *   that exists vanish again, because the row the POST returned is appended
   *   to it. A refetch that FAILS falls back to the list we had plus the site:
   *   the POST succeeded, so showing it is the truth.
   * - `revalidate: false`: the refetch above IS the revalidation. SWR also
   *   discards any hook revalidation that resolves while this mutation is in
   *   flight, so nothing older can land on top of it.
   *
   * The fleet overview key is invalidated too, so the deck does not spend the
   * overview's dedupe window with the new site's card missing.
   */
  const addSite = useCallback(
    (site: Site): Promise<Site[] | undefined> => {
      const written = mutate<Site[]>(
        SITES_KEY,
        async (committed) => {
          let fresh: Site[]
          try {
            fresh = await listSites()
          } catch {
            fresh = committed ?? []
          }
          // A fresh answer that carries the site keeps the server's row; a
          // stale one that lacks it gets the row the POST returned appended.
          return fresh.some((s) => s.id === site.id) ? fresh : [...fresh, site]
        },
        {
          optimisticData: (current) => upsertSite(current, site),
          populateCache: true,
          revalidate: false,
        },
      )
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
