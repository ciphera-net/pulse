import useSWR, { mutate as globalMutate } from 'swr'
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

/** Revalidate the sites list from anywhere (even outside React components) */
export function mutateSites() {
  return globalMutate(SITES_KEY)
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
