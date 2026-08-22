'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getLastSiteId, markSessionEntered, entryRedirectTarget } from '@/lib/last-site'
import { listDeletedSites, restoreSite, type Site } from '@/lib/api/sites'
import { useSites, useSitesOverview } from '@/lib/swr/sites'
import { getSubscription, type SubscriptionDetails } from '@/lib/api/billing'
import FleetDeck from '@/components/sites/FleetDeck'
import FleetHeader from '@/components/sites/FleetHeader'
import DeleteSiteModal from '@/components/sites/DeleteSiteModal'
import { Badge, toast, getAuthErrorMessage } from '@ciphera-net/facet'
import { cdnUrl } from '@/lib/cdn'
import { useCan } from '@/lib/auth/permissions'
import { getSitesLimitForPlan } from '@/lib/plans'
import { SitesListSkeleton, useMinimumLoading, useSkeletonFade } from '@/components/skeletons'

export default function HomeDashboard() {
  const router = useRouter()
  const { sites, isLoading: sitesLoading, mutate: mutateSitesList } = useSites()
  // * The Fleet Deck's data arrives in ONE batched request (visitors today in
  // * the site's timezone, 7-day series, install + uptime status) — the former
  // * per-site Promise.allSettled stats fan-out is gone with it.
  const { overviewBySite, overviewError, mutate: mutateOverview } = useSitesOverview()
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null)
  const [deletedSites, setDeletedSites] = useState<Site[]>([])
  const [permanentDeleteSiteModal, setPermanentDeleteSiteModal] = useState<Site | null>(null)
  // * null = redirect decision pending (hold the skeleton, don't flash the list)
  const [entryRedirect, setEntryRedirect] = useState<string | null | false>(sitesLoading ? null : false)

  // * App entry lands on the last-visited site, once per browser session.
  // * The decision waits for the sites list so the remembered id is validated
  // * against current access (deleted site / revoked role → show the list).
  useEffect(() => {
    if (sitesLoading) return
    const target = entryRedirectTarget(getLastSiteId(), sites.map((s) => s.id), markSessionEntered())
    setEntryRedirect(target ?? false)
    if (target) router.replace(`/sites/${target}`)
  }, [sitesLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadDeletedSites()
    loadSubscription()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('subscribed') === '1') {
      toast.success('Your subscription is active. You can add sites and start tracking.')
      params.delete('subscribed')
      const newUrl = params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname
      window.history.replaceState({}, '', newUrl)
    }
  }, [])

  const loadDeletedSites = async () => {
    try {
      const deleted = await listDeletedSites()
      setDeletedSites(deleted)
    } catch {
      setDeletedSites([])
    }
  }

  const loadSubscription = async () => {
    try {
      const sub = await getSubscription()
      setSubscription(sub)
    } catch {
      setSubscription(null)
    }
  }

  const handleRestore = async (id: string) => {
    try {
      await restoreSite(id)
      toast.success('Site restored successfully')
      mutateSitesList()
      loadDeletedSites()
    } catch (error: unknown) {
      toast.error(getAuthErrorMessage(error) || 'Failed to restore site')
    }
  }

  const handlePermanentDelete = (id: string) => {
    const site = deletedSites.find((s) => s.id === id)
    if (site) setPermanentDeleteSiteModal(site)
  }

  // * Match the skeleton-with-minimum-display-time pattern used across site
  // * pages (behavior, journeys, funnels, etc.). useMinimumLoading keeps the
  // * skeleton visible for >=300ms once shown to prevent flicker on fast loads.
  const canCreateSite = useCan('sites.create')
  const showSkeleton = useMinimumLoading(sitesLoading && sites.length === 0)
  const fadeClass = useSkeletonFade(showSkeleton)

  const siteLimit = getSitesLimitForPlan(subscription?.plan_id)
  const atLimit = siteLimit != null && sites.length >= siteLimit

  return (
    <div className={`w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8 ${fadeClass}`}>
      <FleetHeader siteCount={sites.length} siteLimit={siteLimit} canCreate={canCreateSite} />
      {atLimit && deletedSites.length > 0 && (
        <p className="-mt-3 mb-4 text-sm text-neutral-400">
          You have a site pending deletion. Restore it or permanently delete it to free the slot.
        </p>
      )}

      {showSkeleton || entryRedirect !== false ? (
        /* also held while the entry redirect is pending or in flight, so the
           list never flashes before navigation */
        <SitesListSkeleton rows={4} />
      ) : sites.length === 0 ? (
        <div className="mb-8 flex flex-col items-center justify-center gap-4 py-16 px-6 text-center rounded-none border-2 border-dashed border-brand-orange/30 bg-brand-orange/10">
          <img
            src={cdnUrl('/illustrations/no-sites.png')}
            alt=""
            className="w-80 h-auto"
          />
          <h3 className="text-title-2 font-semibold text-neutral-100">No sites yet</h3>
          <p className="max-w-sm text-caption text-neutral-400">
            Connect a domain to start collecting privacy-friendly analytics. You can add more sites later from the dashboard.
          </p>
          {canCreateSite && <Link
            href="/sites/new"
            className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-none bg-brand-orange text-white text-sm font-medium hover:bg-brand-orange-hover transition-colors duration-fast ease-apple active:scale-[0.97]"
          >
            New site
          </Link>}
        </div>
      ) : (
        <FleetDeck
          sites={sites}
          overviewBySite={overviewBySite}
          overviewError={!!overviewError}
          onRetryOverview={() => mutateOverview()}
        />
      )}

      <DeleteSiteModal
        open={!!permanentDeleteSiteModal}
        onClose={() => setPermanentDeleteSiteModal(null)}
        onDeleted={() => { mutateSitesList(); loadDeletedSites() }}
        siteName={permanentDeleteSiteModal?.name || ''}
        siteDomain={permanentDeleteSiteModal?.domain || ''}
        siteId={permanentDeleteSiteModal?.id || ''}
        permanentOnly
      />

      {deletedSites.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-medium text-neutral-400 mb-4">Scheduled for Deletion</h3>
          <div className="space-y-3">
            {deletedSites.map((site) => {
              const purgeAt = site.deleted_at ? new Date(new Date(site.deleted_at).getTime() + 7 * 24 * 60 * 60 * 1000) : null
              const daysLeft = purgeAt ? Math.max(0, Math.ceil((purgeAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0

              return (
                <div key={site.id} className="flex items-center justify-between rounded-none border border-neutral-800 bg-neutral-900 p-4 opacity-70">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-neutral-300">{site.name}</span>
                    <span className="text-sm text-neutral-400">{site.domain}</span>
                    <Badge variant="danger" size="sm">
                      Deleting in {daysLeft} day{daysLeft !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRestore(site.id)}
                      className="rounded-none border border-input bg-card px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors ease-apple hover:border-line-hover"
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => handlePermanentDelete(site.id)}
                      className="rounded-none border border-red-900 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors ease-apple hover:bg-red-900/20"
                    >
                      Delete Now
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
