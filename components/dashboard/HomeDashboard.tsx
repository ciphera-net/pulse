'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { listDeletedSites, restoreSite, type Site } from '@/lib/api/sites'
import { useSites } from '@/lib/swr/sites'
import { getStats, type Stats } from '@/lib/api/stats'
import { getSubscription, type SubscriptionDetails } from '@/lib/api/billing'
import SiteList from '@/components/sites/SiteList'
import DeleteSiteModal from '@/components/sites/DeleteSiteModal'
import { Button, XIcon, toast, getAuthErrorMessage } from '@ciphera-net/ui'
import { getSitesLimitForPlan } from '@/lib/plans'

type SiteStatsMap = Record<string, { stats: Stats }>

export default function HomeDashboard() {
  const { sites, isLoading: sitesLoading, mutate: mutateSitesList } = useSites()
  const [siteStats, setSiteStats] = useState<SiteStatsMap>({})
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null)
  const [showFinishSetupBanner, setShowFinishSetupBanner] = useState(true)
  const [deletedSites, setDeletedSites] = useState<Site[]>([])
  const [permanentDeleteSiteModal, setPermanentDeleteSiteModal] = useState<Site | null>(null)

  useEffect(() => {
    loadDeletedSites()
    loadSubscription()
  }, [])

  useEffect(() => {
    if (sites.length === 0) {
      setSiteStats({})
      return
    }
    let cancelled = false
    const today = new Date().toISOString().split('T')[0]
    const emptyStats: Stats = { pageviews: 0, visitors: 0, bounce_rate: 0, avg_duration: 0, avg_scroll_depth: 0, avg_visible_duration: 0 }
    const load = async () => {
      const results = await Promise.allSettled(
        sites.map(async (site) => {
          const statsRes = await getStats(site.id, today, today)
          return { siteId: site.id, stats: statsRes }
        })
      )
      if (cancelled) return
      const map: SiteStatsMap = {}
      results.forEach((r, i) => {
        const site = sites[i]
        if (r.status === 'fulfilled') {
          map[site.id] = { stats: r.value.stats }
        } else {
          map[site.id] = { stats: emptyStats }
        }
      })
      setSiteStats(map)
    }
    load()
    return () => { cancelled = true }
  }, [sites])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem('pulse_welcome_completed') === 'true') setShowFinishSetupBanner(false)
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

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8">
      {showFinishSetupBanner && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-brand-orange/30 bg-brand-orange/10 px-4 py-3">
          <p className="text-sm text-neutral-300">
            Finish setting up your workspace and add your first site.
          </p>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link href="/welcome?step=5">
              <Button variant="primary" className="text-sm">
                Finish setup
              </Button>
            </Link>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') localStorage.setItem('pulse_welcome_completed', 'true')
                setShowFinishSetupBanner(false)
              }}
              className="text-neutral-500 hover:text-neutral-400 p-1 rounded"
              aria-label="Dismiss"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-neutral-200 mb-1">Your Sites</h1>
          <p className="text-sm text-neutral-400">Manage your analytics sites and view insights.</p>
        </div>
        {(() => {
          const siteLimit = getSitesLimitForPlan(subscription?.plan_id)
          const atLimit = siteLimit != null && sites.length >= siteLimit
          return atLimit ? (
          <div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-neutral-400 bg-neutral-800 px-3 py-1.5 rounded-lg border border-neutral-700">
                Limit reached ({sites.length}/{siteLimit})
              </span>
              <Link href="/pricing">
                <Button variant="primary" className="text-sm">
                  Upgrade
                </Button>
              </Link>
            </div>
            {deletedSites.length > 0 && (
              <p className="text-sm text-neutral-400 mt-2">
                You have a site pending deletion. Restore it or permanently delete it to free the slot.
              </p>
            )}
          </div>
        ) : null
        })() ?? (
          <Link href="/sites/new">
            <Button variant="primary" className="text-sm whitespace-nowrap">
              Add New Site
            </Button>
          </Link>
        )}
      </div>

      {!sitesLoading && sites.length === 0 && (
        <div className="mb-8 rounded-2xl border-2 border-dashed border-brand-orange/30 bg-brand-orange/10 p-8 text-center flex flex-col items-center">
          <img
            src="/illustrations/setup-analytics.svg"
            alt="Set up your first site"
            className="w-56 h-auto mb-6"
          />
          <h2 className="text-xl font-bold text-white mb-2">Add your first site</h2>
          <p className="text-neutral-400 mb-6 max-w-md mx-auto">
            Connect a domain to start collecting privacy-friendly analytics. You can add more sites later from the dashboard.
          </p>
          <Link href="/sites/new">
            <Button variant="primary" className="min-w-[180px]">
              Add your first site
            </Button>
          </Link>
        </div>
      )}

      {(sitesLoading || sites.length > 0) && (
        <SiteList sites={sites} siteStats={siteStats} loading={sitesLoading} />
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
                <div key={site.id} className="flex items-center justify-between p-4 rounded-xl border border-neutral-800 bg-neutral-900/50 opacity-60">
                  <div>
                    <span className="font-medium text-neutral-300">{site.name}</span>
                    <span className="ml-2 text-sm text-neutral-400">{site.domain}</span>
                    <span className="ml-3 inline-flex items-center rounded-full bg-red-900/20 px-2 py-0.5 text-xs font-medium text-red-400">
                      Deleting in {daysLeft} day{daysLeft !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRestore(site.id)}
                      className="px-3 py-1.5 text-xs font-medium text-neutral-300 border border-neutral-700 rounded-lg hover:bg-neutral-800 transition-colors"
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => handlePermanentDelete(site.id)}
                      className="px-3 py-1.5 text-xs font-medium text-red-400 border border-red-900 rounded-lg hover:bg-red-900/20 transition-colors"
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
