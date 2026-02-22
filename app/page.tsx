'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useAuth } from '@/lib/auth/context'
import { initiateOAuthFlow, initiateSignupFlow } from '@/lib/api/oauth'
import { listSites, deleteSite, type Site } from '@/lib/api/sites'
import { getStats } from '@/lib/api/stats'
import type { Stats } from '@/lib/api/stats'
import { getSubscription, type SubscriptionDetails } from '@/lib/api/billing'
import { LoadingOverlay } from '@ciphera-net/ui'
import SiteList from '@/components/sites/SiteList'
import { Button } from '@ciphera-net/ui'
import { BarChartIcon, LockIcon, ZapIcon, CheckCircleIcon, XIcon, GlobeIcon } from '@ciphera-net/ui'
import { toast } from '@ciphera-net/ui'
import { getAuthErrorMessage } from '@ciphera-net/ui'
import { getSitesLimitForPlan } from '@/lib/plans'

const MOCK_STATS = [
  { label: 'UNIQUE VISITORS', value: '12,847', trend: '+14%', up: true },
  { label: 'TOTAL PAGEVIEWS', value: '48,293', trend: '+8%', up: true },
  { label: 'BOUNCE RATE', value: '42%', trend: '-3%', up: true },
  { label: 'VISIT DURATION', value: '2m 34s', trend: '+11%', up: true },
]

const MOCK_CHART_POINTS = [
  20, 35, 28, 45, 38, 52, 48, 65, 58, 72, 68, 85, 78, 92, 88, 105,
  98, 110, 95, 115, 108, 125, 118, 130, 122, 138, 142, 155, 148, 160,
]

const MOCK_PAGES = [
  { path: '/', views: '8,421' },
  { path: '/pricing', views: '3,287' },
  { path: '/features', views: '2,104' },
  { path: '/blog/getting-started', views: '1,856' },
  { path: '/docs/installation', views: '1,203' },
]

const MOCK_REFERRERS = [
  { name: 'google.com', views: '5,832' },
  { name: 'twitter.com', views: '2,417' },
  { name: 'github.com', views: '1,894' },
  { name: 'reddit.com', views: '1,105' },
  { name: 'Direct / None', views: '987' },
]

function DashboardPreview() {
  const chartMax = Math.max(...MOCK_CHART_POINTS)
  const chartH = 180
  const points = MOCK_CHART_POINTS.map((v, i) => {
    const x = (i / (MOCK_CHART_POINTS.length - 1)) * 100
    const y = chartH - (v / chartMax) * (chartH - 20)
    return `${x},${y}`
  }).join(' ')
  const areaPoints = `0,${chartH} ${points} 100,${chartH}`

  return (
    <div className="relative w-full max-w-7xl mx-auto mt-20 mb-32">
      <div className="absolute inset-0 bg-brand-orange/20 blur-[100px] -z-10 rounded-full opacity-50" />

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.4 }}
        className="relative rounded-xl border border-neutral-200/50 dark:border-neutral-800/50 bg-white dark:bg-neutral-900 shadow-2xl overflow-hidden"
      >
        {/* * Browser chrome */}
        <div className="h-8 bg-neutral-100 dark:bg-neutral-800/80 border-b border-neutral-200 dark:border-white/5 flex items-center px-4 gap-2">
          <div className="w-3 h-3 rounded-full bg-red-400/60" />
          <div className="w-3 h-3 rounded-full bg-yellow-400/60" />
          <div className="w-3 h-3 rounded-full bg-green-400/60" />
          <div className="ml-4 flex-1 max-w-xs h-5 rounded bg-neutral-200 dark:bg-neutral-700/50" />
        </div>

        <div className="p-4 sm:p-6">
          {/* * Header row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div>
                <div className="text-lg font-bold text-neutral-900 dark:text-white">acme.com</div>
                <div className="text-xs text-neutral-500">Last 30 days</div>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-500/10 rounded-full border border-green-500/20">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
                </span>
                <span className="text-xs font-medium text-green-700 dark:text-green-400">24 online</span>
              </div>
            </div>
          </div>

          {/* * Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-neutral-200 dark:divide-neutral-800 border border-neutral-200 dark:border-neutral-800 rounded-t-lg">
            {MOCK_STATS.map((s, i) => (
              <div
                key={i}
                className={`p-3 sm:p-4 ${i === 0 ? 'bg-neutral-50 dark:bg-neutral-800/50' : ''}`}
              >
                <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-1">{s.label}</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg sm:text-xl font-bold text-neutral-900 dark:text-white">{s.value}</span>
                  <span className={`text-xs font-medium ${s.up ? 'text-emerald-600 dark:text-emerald-500' : 'text-red-600 dark:text-red-500'}`}>
                    {s.trend}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* * Chart area */}
          <div className="border border-t-0 border-neutral-200 dark:border-neutral-800 rounded-b-lg p-4 mb-6 bg-white dark:bg-neutral-900">
            <svg viewBox={`0 0 100 ${chartH}`} preserveAspectRatio="none" className="w-full h-[180px]">
              <defs>
                <linearGradient id="mockGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-brand-orange)" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="var(--color-brand-orange)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <polygon points={areaPoints} fill="url(#mockGrad)" />
              <polyline points={points} fill="none" stroke="var(--color-brand-orange)" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>

          {/* * Two-column widgets */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* * Top Pages */}
            <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/30">
                <span className="text-sm font-semibold text-neutral-900 dark:text-white">Top Pages</span>
              </div>
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {MOCK_PAGES.map((p, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-sm text-neutral-700 dark:text-neutral-300 truncate">{p.path}</span>
                    <span className="text-sm font-medium text-neutral-900 dark:text-white ml-4 shrink-0">{p.views}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* * Top Referrers */}
            <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/30">
                <span className="text-sm font-semibold text-neutral-900 dark:text-white">Top Referrers</span>
              </div>
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {MOCK_REFERRERS.map((r, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-sm text-neutral-700 dark:text-neutral-300 truncate">{r.name}</span>
                    <span className="text-sm font-medium text-neutral-900 dark:text-white ml-4 shrink-0">{r.views}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}


function ComparisonSection() {
  return (
    <div className="w-full max-w-4xl mx-auto mb-32">
      <div className="text-center mb-12">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-4">Why choose Pulse?</h2>
        <p className="text-neutral-500">The lightweight, privacy-friendly alternative.</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-neutral-200 dark:border-neutral-800">
              <th className="p-6 text-sm font-medium text-neutral-500">Feature</th>
              <th className="p-6 text-sm font-bold text-brand-orange">Pulse</th>
              <th className="p-6 text-sm font-medium text-neutral-500">Google Analytics</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {[
              { feature: "Cookie Banner Required", pulse: false, ga: true },
              { feature: "GDPR Compliant", pulse: true, ga: "Complex" },
              { feature: "Script Size", pulse: "< 1 KB", ga: "45 KB+" },
              { feature: "Data Ownership", pulse: "Yours", ga: "Google's" },
            ].map((row, i) => (
              <tr key={i} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/50 transition-colors">
                <td className="p-6 text-neutral-900 dark:text-white font-medium">{row.feature}</td>
                <td className="p-6">
                  {row.pulse === true ? (
                    <CheckCircleIcon className="w-5 h-5 text-green-500" />
                  ) : row.pulse === false ? (
                    <span className="text-green-500 font-medium">No</span>
                  ) : (
                    <span className="text-green-500 font-medium">{row.pulse}</span>
                  )}
                </td>
                <td className="p-6 text-neutral-500">
                   {row.ga === true ? (
                    <span className="text-red-500 font-medium">Yes</span>
                  ) : (
                    <span>{row.ga}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}


type SiteStatsMap = Record<string, { stats: Stats }>

export default function HomePage() {
  const { user, loading: authLoading } = useAuth()
  const [sites, setSites] = useState<Site[]>([])
  const [sitesLoading, setSitesLoading] = useState(true)
  const [siteStats, setSiteStats] = useState<SiteStatsMap>({})
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null)
  const [subscriptionLoading, setSubscriptionLoading] = useState(false)
  const [showFinishSetupBanner, setShowFinishSetupBanner] = useState(true)

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

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this site? This action cannot be undone.')) {
      return
    }

    try {
      await deleteSite(id)
      toast.success('Site deleted successfully')
      loadSites()
    } catch (error: unknown) {
      toast.error(getAuthErrorMessage(error) || 'Failed to delete site')
    }
  }

  if (authLoading) {
    return <LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Pulse" portal={false} />
  }

  if (!user) {
    return (
      <div className="relative min-h-screen flex flex-col overflow-hidden">
        
        {/* * --- 1. ATMOSPHERE (Background) --- */}
        <div className="absolute inset-0 -z-10 pointer-events-none">
          {/* * Top-left Orange Glow */}
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-brand-orange/10 rounded-full blur-[128px] opacity-60" />
          {/* * Bottom-right Neutral Glow */}
          <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-neutral-500/10 dark:bg-neutral-400/10 rounded-full blur-[128px] opacity-40" />
          {/* * Grid Pattern with Radial Mask */}
          <div 
            className="absolute inset-0 bg-grid-pattern opacity-[0.02] dark:opacity-[0.05]"
            style={{ maskImage: 'radial-gradient(ellipse at center, black 0%, transparent 70%)' }}
          />
        </div>

        <div className="flex-grow w-full max-w-6xl mx-auto px-4 pt-20 pb-10 z-10">
          
          {/* * --- 2. BADGE --- */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex justify-center mb-8 w-full"
          >
            <span className="badge-primary">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-orange animate-pulse" />
              Privacy-First Analytics
            </span>
          </motion.div>

          {/* * --- 3. HEADLINE --- */}
          <div className="text-center mb-20">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-5xl md:text-7xl font-bold tracking-tight text-neutral-900 dark:text-white mb-6"
            >
              Simple analytics for <br />
              <span className="relative inline-block">
                <span className="gradient-text">privacy-conscious</span>
                {/* * SVG Underline from Main Site */}
                <svg className="absolute -bottom-2 left-0 w-full h-3 text-brand-orange/30" viewBox="0 0 200 12" preserveAspectRatio="none">
                  <path d="M0 9C50 3 150 3 200 9" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                </svg>
              </span>
              {' '}apps.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-xl text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto mb-10 leading-relaxed"
            >
              Respect your users' privacy while getting the insights you need. 
              No cookies, no IP tracking, fully GDPR compliant.
            </motion.p>

            {/* * --- 4. CTAs --- */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-20"
            >
              <Button onClick={() => initiateOAuthFlow()} variant="primary" className="px-8 py-4 text-lg shadow-lg shadow-brand-orange/20">
                Get Started
              </Button>
              <Button onClick={() => initiateSignupFlow()} variant="secondary" className="px-8 py-4 text-lg">
                Create Account
              </Button>
            </motion.div>
          </div>

          {/* * NEW: DASHBOARD PREVIEW */}
          <DashboardPreview />

          {/* * --- 5. GLASS CARDS --- */}
          <div className="grid md:grid-cols-3 gap-6 text-left mb-32">
            {[
              { icon: LockIcon, title: "Privacy First", desc: "We don't track personal data. No IP addresses, no fingerprints, no cookies." },
              { icon: BarChartIcon, title: "Simple Insights", desc: "Get the metrics that matter without the clutter. Page views, visitors, and sources." },
              { icon: ZapIcon, title: "Lightweight", desc: "Our script is less than 1kb. It won't slow down your site or affect your SEO." }
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="card-glass p-6 hover:-translate-y-1 hover:shadow-xl transition-all duration-300 group"
              >
                <div className="w-12 h-12 rounded-xl bg-brand-orange/10 flex items-center justify-center mb-6 text-brand-orange group-hover:scale-110 transition-transform duration-300">
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-3">{feature.title}</h3>
                <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  {feature.desc}
                </p>
              </motion.div>
            ))}
          </div>

          {/* * NEW: COMPARISON SECTION */}
          <ComparisonSection />

          {/* * NEW: CTA BOTTOM */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mb-20"
          >
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-white mb-6">Ready to switch?</h2>
            <Button onClick={() => initiateOAuthFlow()} variant="primary" className="px-8 py-4 text-lg shadow-lg shadow-brand-orange/20">
              Start your free trial
            </Button>
            <p className="mt-4 text-sm text-neutral-500">No credit card required • Cancel anytime</p>
          </motion.div>

        </div>
      </div>
    )
  }

  // * Wait for organization context before rendering SiteList to avoid "Organization Required" flash
  if (user && !user.org_id) {
    return <LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Pulse" portal={false} />
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
      {showFinishSetupBanner && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-brand-orange/30 bg-brand-orange/5 px-4 py-3 dark:bg-brand-orange/10">
          <p className="text-sm text-neutral-700 dark:text-neutral-300">
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
              className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-400 p-1 rounded"
              aria-label="Dismiss"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Your Sites</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Manage your analytics sites and view insights.</p>
        </div>
        {(() => {
          const siteLimit = getSitesLimitForPlan(subscription?.plan_id)
          const atLimit = siteLimit != null && sites.length >= siteLimit
          return atLimit ? (
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700">
              Limit reached ({sites.length}/{siteLimit})
            </span>
            <Link href="/pricing">
              <Button variant="primary" className="text-sm">
                Upgrade
              </Button>
            </Link>
          </div>
        ) : null
        })() ?? (
          <Link href="/sites/new">
            <Button variant="primary" className="text-sm">
              Add New Site
            </Button>
          </Link>
        )}
      </div>

      {/* * Global Overview - min-h ensures no layout shift when Plan & usage loads */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex min-h-[160px] flex-col rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Total Sites</p>
          <p className="text-2xl font-bold text-neutral-900 dark:text-white">{sites.length}</p>
        </div>
        <div className="flex min-h-[160px] flex-col rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Total Visitors (24h)</p>
          <p className="text-2xl font-bold text-neutral-900 dark:text-white">
            {sites.length === 0 || Object.keys(siteStats).length < sites.length
              ? '--'
              : Object.values(siteStats).reduce((sum, { stats }) => sum + (stats?.visitors ?? 0), 0).toLocaleString()}
          </p>
        </div>
        <div className="flex min-h-[160px] flex-col rounded-2xl border border-neutral-200 bg-brand-orange/10 p-4 dark:border-neutral-800">
          <p className="text-sm text-brand-orange">Plan & usage</p>
          {subscriptionLoading ? (
            <div className="animate-pulse space-y-2">
              <div className="h-6 w-24 rounded bg-brand-orange/25 dark:bg-brand-orange/20" />
              <div className="h-4 w-full rounded bg-brand-orange/25 dark:bg-brand-orange/20" />
              <div className="h-4 w-3/4 rounded bg-brand-orange/25 dark:bg-brand-orange/20" />
              <div className="h-4 w-20 rounded bg-brand-orange/25 dark:bg-brand-orange/20 pt-2" />
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
                <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
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
                          ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
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
                  <Link href="/org-settings?tab=billing" className="text-sm font-medium text-brand-orange hover:underline focus:outline-none focus:ring-2 focus:ring-brand-orange focus:rounded">
                    Manage billing
                  </Link>
                ) : (
                  <Link href="/pricing" className="text-sm font-medium text-brand-orange hover:underline focus:outline-none focus:ring-2 focus:ring-brand-orange focus:rounded">
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
        <div className="mb-8 rounded-2xl border-2 border-dashed border-brand-orange/30 bg-brand-orange/5 p-6 text-center dark:bg-brand-orange/10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-orange/20 text-brand-orange mb-4">
            <GlobeIcon className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold text-neutral-900 dark:text-white mb-2">Add your first site</h2>
          <p className="text-neutral-600 dark:text-neutral-400 mb-6 max-w-md mx-auto">
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
    </div>
  )
}
