'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useAuth } from '@/lib/auth/context'
import { initiateOAuthFlow } from '@/lib/api/oauth'
import { listSites, listDeletedSites, restoreSite, type Site } from '@/lib/api/sites'
import { getStats } from '@/lib/api/stats'
import type { Stats } from '@/lib/api/stats'
import { getSubscription, type SubscriptionDetails } from '@/lib/api/billing'
import { LoadingOverlay } from '@ciphera-net/ui'
import SiteList from '@/components/sites/SiteList'
import DeleteSiteModal from '@/components/sites/DeleteSiteModal'
import { Button } from '@ciphera-net/ui'
import { XIcon } from '@ciphera-net/ui'
import { Cookie, ShieldCheck, Code, Lightning, ArrowRight, GithubLogo } from '@phosphor-icons/react'
import DashboardDemo from '@/components/marketing/DashboardDemo'
import FeatureSections from '@/components/marketing/FeatureSections'
import ComparisonCards from '@/components/marketing/ComparisonCards'
import CTASection from '@/components/marketing/CTASection'
import PulseFAQ from '@/components/marketing/PulseFAQ'
import { toast } from '@ciphera-net/ui'
import { getAuthErrorMessage } from '@ciphera-net/ui'
import { getSitesLimitForPlan } from '@/lib/plans'
import { formatDate } from '@/lib/utils/formatDate'

type SiteStatsMap = Record<string, { stats: Stats }>

export default function HomePage() {
  const { user, loading: authLoading } = useAuth()
  const [sites, setSites] = useState<Site[]>([])
  const [sitesLoading, setSitesLoading] = useState(true)
  const [siteStats, setSiteStats] = useState<SiteStatsMap>({})
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null)
  const [subscriptionLoading, setSubscriptionLoading] = useState(false)
  const [showFinishSetupBanner, setShowFinishSetupBanner] = useState(true)
  const [deleteModalSite, setDeleteModalSite] = useState<Site | null>(null)
  const [deletedSites, setDeletedSites] = useState<Site[]>([])
  const [permanentDeleteSiteModal, setPermanentDeleteSiteModal] = useState<Site | null>(null)

  useEffect(() => {
    if (user?.org_id) {
      loadSites()
      loadSubscription()
    }
  }, [user])

  useEffect(() => {
    if (sites.length === 0) {
      setSiteStats({})
      return
    }
    let cancelled = false
    const today = new Date().toISOString().split('T')[0]
    const emptyStats: Stats = { pageviews: 0, visitors: 0, bounce_rate: 0, avg_duration: 0 }
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
  }, [user?.org_id])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('trial_started') === '1') {
      toast.success('Your trial is active. You can add sites and start tracking.')
      params.delete('trial_started')
      const newUrl = params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname
      window.history.replaceState({}, '', newUrl)
    }
  }, [])

  const loadSites = async () => {
    try {
      setSitesLoading(true)
      const data = await listSites()
      setSites(Array.isArray(data) ? data : [])
      try {
        const deleted = await listDeletedSites()
        setDeletedSites(deleted)
      } catch {
        setDeletedSites([])
      }
    } catch (error: unknown) {
      toast.error(getAuthErrorMessage(error) || 'Failed to load your sites')
      setSites([])
    } finally {
      setSitesLoading(false)
    }
  }

  const loadSubscription = async () => {
    try {
      setSubscriptionLoading(true)
      const sub = await getSubscription()
      setSubscription(sub)
    } catch {
      setSubscription(null)
    } finally {
      setSubscriptionLoading(false)
    }
  }

  const handleDelete = (id: string) => {
    const site = sites.find((s) => s.id === id)
    if (site) setDeleteModalSite(site)
  }

  const handleRestore = async (id: string) => {
    try {
      await restoreSite(id)
      toast.success('Site restored successfully')
      loadSites()
    } catch (error: unknown) {
      toast.error(getAuthErrorMessage(error) || 'Failed to restore site')
    }
  }

  const handlePermanentDelete = (id: string) => {
    const site = deletedSites.find((s) => s.id === id)
    if (site) setPermanentDeleteSiteModal(site)
  }

  if (authLoading) {
    return <LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Pulse" portal={false} />
  }

  if (!user) {
    return (
      <>
        {/* HERO — compact headline + live demo */}
        <div className="pt-20 pb-10 lg:pt-28 lg:pb-16">
          <div className="w-full max-w-6xl mx-auto px-6 text-center mb-16">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-4xl sm:text-5xl md:text-6xl font-bold text-white leading-[1.1] mb-6"
            >
              Analytics without the{' '}
              <span className="relative inline-block">
                <span className="gradient-text">surveillance.</span>
                <svg className="absolute -bottom-2 left-0 w-full h-3 text-brand-orange/30" viewBox="0 0 200 12" preserveAspectRatio="none">
                  <path d="M0 9C50 3 150 3 200 9" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                </svg>
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-xl text-neutral-300 mb-8 leading-relaxed max-w-2xl mx-auto"
            >
              Respect your users&apos; privacy while getting the insights you need.
              No cookies, no IP tracking, fully GDPR compliant.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="flex flex-row gap-3 flex-wrap justify-center mb-8"
            >
              <Button onClick={() => initiateOAuthFlow()} variant="primary" className="px-6 py-3 shadow-lg shadow-brand-orange/20 gap-2">
                Try Pulse Free <ArrowRight weight="bold" className="w-4 h-4" />
              </Button>
              <Button onClick={() => window.open('https://github.com/ciphera-net/pulse', '_blank')} variant="secondary" className="px-6 py-3 border border-white/10 gap-2">
                <GithubLogo weight="bold" className="w-4 h-4" /> View on GitHub
              </Button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-neutral-400 justify-center"
            >
              <span className="flex items-center gap-2"><Cookie weight="bold" className="w-4 h-4" /> Cookie-free</span>
              <span className="text-neutral-700">|</span>
              <span className="flex items-center gap-2"><Code weight="bold" className="w-4 h-4" /> Open source client</span>
              <span className="text-neutral-700">|</span>
              <span className="flex items-center gap-2"><ShieldCheck weight="bold" className="w-4 h-4" /> GDPR compliant</span>
              <span className="text-neutral-700">|</span>
              <span className="flex items-center gap-2"><Lightning weight="bold" className="w-4 h-4" /> Under 2KB</span>
            </motion.div>
          </div>

          {/* Live Dashboard Demo */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="w-full max-w-7xl mx-auto px-6"
          >
            <DashboardDemo />
          </motion.div>
        </div>

        <FeatureSections />
        <ComparisonCards />
        <PulseFAQ />
        <CTASection />
      </>
    )
  }

  // * Wait for organization context before rendering SiteList to avoid "Organization Required" flash
  if (user && !user.org_id) {
    return <LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Pulse" portal={false} />
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
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

      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Your Sites</h1>
          <p className="mt-1 text-sm text-neutral-400">Manage your analytics sites and view insights.</p>
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

      {/* * Global Overview - min-h ensures no layout shift when Plan & usage loads */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex min-h-[100px] sm:min-h-[160px] flex-col rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-sm text-neutral-400">Total Sites</p>
          <p className="text-2xl font-bold text-white">{sites.length}</p>
        </div>
        <div className="flex min-h-[100px] sm:min-h-[160px] flex-col rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-sm text-neutral-400">Total Visitors (24h)</p>
          <p className="text-2xl font-bold text-white">
            {sites.length === 0 || Object.keys(siteStats).length < sites.length
              ? '--'
              : Object.values(siteStats).reduce((sum, { stats }) => sum + (stats?.visitors ?? 0), 0).toLocaleString()}
          </p>
        </div>
        <div className="flex min-h-[160px] flex-col rounded-2xl border border-neutral-800 bg-brand-orange/10 p-4">
          <p className="text-sm text-brand-orange">Plan & usage</p>
          {subscriptionLoading ? (
            <div className="animate-pulse space-y-2">
              <div className="h-6 w-24 rounded bg-brand-orange/20" />
              <div className="h-4 w-full rounded bg-brand-orange/20" />
              <div className="h-4 w-3/4 rounded bg-brand-orange/20" />
              <div className="h-4 w-20 rounded bg-brand-orange/20 pt-2" />
            </div>
          ) : subscription ? (
            <>
              <p className="text-lg font-bold text-brand-orange">
                {(() => {
                  const raw =
                    subscription.plan_id?.startsWith('price_')
                      ? 'Pro'
                      : subscription.plan_id === 'free' || !subscription.plan_id
                        ? 'Free'
                        : subscription.plan_id
                  const label = raw === 'Free' || raw === 'Pro' ? raw : raw.charAt(0).toUpperCase() + raw.slice(1)
                  return `${label} Plan`
                })()}
              </p>
              {(typeof subscription.sites_count === 'number' || (subscription.pageview_limit > 0 && typeof subscription.pageview_usage === 'number') || (subscription.next_invoice_amount_due != null && subscription.next_invoice_currency && !subscription.cancel_at_period_end && (subscription.subscription_status === 'active' || subscription.subscription_status === 'trialing'))) && (
                <p className="text-sm text-neutral-400 mt-1">
                  {typeof subscription.sites_count === 'number' && (
                    <span>Sites: {(() => {
                      const limit = getSitesLimitForPlan(subscription.plan_id)
                      return limit != null && typeof subscription.sites_count === 'number' ? `${subscription.sites_count}/${limit}` : subscription.sites_count
                    })()}</span>
                  )}
                  {typeof subscription.sites_count === 'number' && (subscription.pageview_limit > 0 && typeof subscription.pageview_usage === 'number') && ' · '}
                  {subscription.pageview_limit > 0 && typeof subscription.pageview_usage === 'number' && (
                    <span>Pageviews: {subscription.pageview_usage.toLocaleString()}/{subscription.pageview_limit.toLocaleString()}</span>
                  )}
                  {subscription.next_invoice_amount_due != null && subscription.next_invoice_currency && !subscription.cancel_at_period_end && (subscription.subscription_status === 'active' || subscription.subscription_status === 'trialing') && (
                    <span className="block mt-1">
                      Renews {(() => {
                        const ts = subscription.next_invoice_period_end ?? subscription.current_period_end
                        const d = ts ? new Date(typeof ts === 'number' ? ts * 1000 : ts) : null
                        const dateStr = d && !Number.isNaN(d.getTime()) && d.getTime() !== 0
                          ? formatDate(d)
                          : null
                        const amount = (subscription.next_invoice_amount_due / 100).toLocaleString('en-US', {
                          style: 'currency',
                          currency: subscription.next_invoice_currency.toUpperCase(),
                        })
                        return dateStr ? `${dateStr} for ${amount}` : amount
                      })()}
                    </span>
                  )}
                </p>
              )}
              <div className="mt-2 flex gap-2">
                {subscription.has_payment_method ? (
                  <Link href="/org-settings?tab=billing" className="text-sm font-medium text-brand-orange hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:rounded">
                    Manage billing
                  </Link>
                ) : (
                  <Link href="/pricing" className="text-sm font-medium text-brand-orange hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange focus-visible:rounded">
                    Upgrade
                  </Link>
                )}
              </div>
            </>
          ) : (
            <p className="text-lg font-bold text-brand-orange">Free Plan</p>
          )}
        </div>
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
        <SiteList sites={sites} siteStats={siteStats} loading={sitesLoading} onDelete={handleDelete} />
      )}

      <DeleteSiteModal
        open={!!deleteModalSite}
        onClose={() => setDeleteModalSite(null)}
        onDeleted={loadSites}
        siteName={deleteModalSite?.name || ''}
        siteDomain={deleteModalSite?.domain || ''}
        siteId={deleteModalSite?.id || ''}
      />

      <DeleteSiteModal
        open={!!permanentDeleteSiteModal}
        onClose={() => setPermanentDeleteSiteModal(null)}
        onDeleted={loadSites}
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
