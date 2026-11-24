'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getLastSiteId, markSessionEntered, entryRedirectTarget } from '@/lib/last-site'
import { restoreSite, type Site } from '@/lib/api/sites'
import { useSites, useSitesOverview, useDeletedSites, useRefreshSiteLists } from '@/lib/swr/sites'
import { getSubscription, type SubscriptionDetails } from '@/lib/api/billing'
import FleetDeck from '@/components/sites/FleetDeck'
import FleetHeader from '@/components/sites/FleetHeader'
import SitesDeck from '@/components/sites/SitesDeck'
import DeletedSitesList from '@/components/sites/DeletedSitesList'
import { oneSiteTarget } from '@/components/sites/oneSite'
import { useFeature } from '@/lib/features'
import DeleteSiteModal from '@/components/sites/DeleteSiteModal'
import { Badge, toast, getAuthErrorMessage } from '@ciphera-net/facet'
import { useCan } from '@/lib/auth/permissions'
import { getSitesLimitForPlan } from '@/lib/plans'
import { SitesListSkeleton, useMinimumLoading, useSkeletonFade } from '@/components/skeletons'
import { EmptyState } from '@/components/ui/EmptyState'
import { Globe } from '@phosphor-icons/react'

export default function HomeDashboard() {
  const router = useRouter()
  const { sites, isLoading: sitesLoading } = useSites()
  // * The Fleet Deck's data arrives in ONE batched request (visitors today in
  // * the site's timezone, 7-day series, install + uptime status). The former
  // * per-site Promise.allSettled stats fan-out is gone with it.
  const { overviewBySite, overviewError, mutate: mutateOverview } = useSitesOverview()
  // * The "Scheduled for deletion" list below. An SWR key (lib/swr/sites.tsx),
  // * not local state, so it is reachable from outside this component: a soft
  // * delete confirmed on the site's own settings page commits here, through
  // * useRefreshSiteLists, well after this page may have been navigated to
  // * and mounted fresh (PUL-28).
  const { deletedSites, isLoading: deletedLoading } = useDeletedSites()
  const refreshSiteLists = useRefreshSiteLists()
  // * The new Your Sites page (beta new-sites, 24-11-2026; plan Pulse/docs/plans/23-11-2026-your-sites-page-overhaul-plan.md).
  // * null until /me answers: the page holds its skeleton rather than show one page and then the other.
  const newSites = useFeature('new-sites')
  // * R124: a team with ONE site goes straight to its dashboard, decided once both lists are in (a site waiting to be
  // * deleted keeps the page, where it can be restored). Computed in render so the list never flashes before it.
  const oneSite = newSites === true && !sitesLoading && !deletedLoading ? oneSiteTarget(sites.map((s) => s.id), deletedSites.length) : null
  const deciding = newSites === null || (newSites === true && (sitesLoading || deletedLoading))
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null)
  const [permanentDeleteSiteModal, setPermanentDeleteSiteModal] = useState<Site | null>(null)
  // * null = redirect decision pending (hold the skeleton, don't flash the list)
  const [entryRedirect, setEntryRedirect] = useState<string | null | false>(sitesLoading ? null : false)

  // * App entry lands on the last-visited site, once per browser session.
  // * The decision waits for the sites list so the remembered id is validated
  // * against current access (deleted site / revoked role shows the list).
  useEffect(() => {
    if (sitesLoading) return
    const target = entryRedirectTarget(getLastSiteId(), sites.map((s) => s.id), markSessionEntered())
    setEntryRedirect(target ?? false)
    if (target) router.replace(`/sites/${target}`)
  }, [sitesLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (oneSite) router.replace(`/sites/${oneSite}`)
  }, [oneSite]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
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

  const loadSubscription = async () => {
    try {
      const sub = await getSubscription()
      setSubscription(sub)
    } catch {
      setSubscription(null)
    }
  }

  // Restore stays one click (ruling 4: small reversible actions need no hold).
  const handleRestore = async (id: string) => {
    try {
      await restoreSite(id)
      toast.success(newSites ? 'Site restored' : 'Site restored successfully')
      refreshSiteLists()
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
      <FleetHeader siteCount={sites.length} siteLimit={siteLimit} canCreate={canCreateSite} addLabel={newSites ? 'Add site' : undefined} />
      {atLimit && deletedSites.length > 0 && (
        <p className="-mt-3 mb-4 text-sm text-neutral-400">
          You have a site pending deletion. Restore it or permanently delete it to free the slot.
        </p>
      )}

      {showSkeleton || entryRedirect !== false || deciding || oneSite ? (
        /* also held while the entry redirect is pending or in flight, while the
           beta is unknown, and while a one-site team is on its way to its site
           (R124), so the list never flashes before navigation */
        <SitesListSkeleton rows={4} />
      ) : sites.length === 0 ? (
        // Pulse's one empty state (R57, 16-11-2026), in a card like the sites it waits for.
        <div className="mb-8 rounded-none border border-border bg-card">
          <EmptyState
            icon={<Globe />}
            title="No sites yet"
            description="Connect a domain to start collecting privacy-friendly analytics. You can add more sites later from the dashboard."
            action={canCreateSite ? { label: 'New site', href: '/sites/new' } : undefined}
          />
        </div>
      ) : newSites ? (
        <SitesDeck
          sites={sites}
          overviewBySite={overviewBySite}
          overviewError={!!overviewError}
          onRetryOverview={() => mutateOverview()}
        />
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
        siteName={permanentDeleteSiteModal?.name || ''}
        siteDomain={permanentDeleteSiteModal?.domain || ''}
        siteId={permanentDeleteSiteModal?.id || ''}
        permanentOnly
      />

      {newSites && <DeletedSitesList sites={deletedSites} onRestore={handleRestore} onDeleteNow={handlePermanentDelete} />}

      {!newSites && deletedSites.length > 0 && (
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
                      aria-haspopup="dialog"
                      // The one danger colour (the destructive token), not raw reds.
                      className="rounded-none border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive transition-colors ease-apple hover:border-destructive/60 hover:bg-destructive/10"
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
