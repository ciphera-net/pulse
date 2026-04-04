import useSWR, { mutate as globalMutate } from 'swr'
import { listSites, type Site } from '@/lib/api/sites'
import { FAVICON_SERVICE_URL } from '@/lib/utils/favicon'

const SITES_KEY = 'sites'

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
