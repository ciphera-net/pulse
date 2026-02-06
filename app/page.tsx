'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useAuth } from '@/lib/auth/context'
import { initiateOAuthFlow, initiateSignupFlow } from '@/lib/api/oauth'
import { listSites, deleteSite, type Site } from '@/lib/api/sites'
import { getSubscription, type SubscriptionDetails } from '@/lib/api/billing'
import { LoadingOverlay } from '@ciphera-net/ui'
import SiteList from '@/components/sites/SiteList'
import { Button } from '@ciphera-net/ui'
import { BarChartIcon, LockIcon, ZapIcon, CheckCircleIcon, XIcon } from '@ciphera-net/ui'
import { toast } from '@ciphera-net/ui'
import { getAuthErrorMessage } from '@/lib/utils/authErrors'

function DashboardPreview() {
  return (
    <div className="relative w-full max-w-7xl mx-auto mt-20 mb-32 h-[600px] flex items-center justify-center">
      {/* * Glow behind the image */}
      <div className="absolute inset-0 bg-brand-orange/20 blur-[100px] -z-10 rounded-full opacity-50" />
      
      {/* * Static Container */}
      <div
        className="relative w-full h-full rounded-xl border border-neutral-200/50 dark:border-neutral-800/50 bg-neutral-900/50 backdrop-blur-sm shadow-2xl overflow-hidden"
      >
        {/* * Header of the fake browser window */}
        <div className="h-8 bg-neutral-800/50 border-b border-white/5 flex items-center px-4 gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500/50" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
          <div className="w-3 h-3 rounded-full bg-green-500/50" />
        </div>
        
        {/* * Placeholder for actual dashboard screenshot - replace src with real image later */}
        <div className="w-full h-[calc(100%-2rem)] bg-neutral-900 flex items-center justify-center text-neutral-700">
           <div className="text-center">
             <BarChartIcon className="w-16 h-16 mx-auto mb-4 opacity-20" />
             <p>Dashboard Preview</p>
           </div>
        </div>
      </div>
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


export default function HomePage() {
  const { user, loading: authLoading } = useAuth()
  const [sites, setSites] = useState<Site[]>([])
  const [sitesLoading, setSitesLoading] = useState(true)
  const [subscription, setSubscription] = useState<SubscriptionDetails | null>(null)
  const [subscriptionLoading, setSubscriptionLoading] = useState(false)

  useEffect(() => {
    if (user?.org_id) {
      loadSites()
      loadSubscription()
    }
  }, [user])

  const loadSites = async () => {
    try {
      setSitesLoading(true)
      const data = await listSites()
      setSites(Array.isArray(data) ? data : [])
    } catch (error: any) {
      toast.error(getAuthErrorMessage(error) || 'Failed to load sites: ' + ((error as Error)?.message || 'Unknown error'))
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
    } catch (error: any) {
      toast.error(getAuthErrorMessage(error) || 'Failed to delete site: ' + ((error as Error)?.message || 'Unknown error'))
    }
  }

  if (authLoading) {
    return <LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Pulse" portal={false} />
  }

  if (!user) {
    return (
      <div className="relative min-h-screen flex flex-col overflow-hidden selection:bg-brand-orange/20">
        
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
                className="card-glass p-8 hover:-translate-y-1 hover:shadow-xl transition-all duration-300 group"
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
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Your Sites</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Manage your analytics sites and view insights.</p>
        </div>
        {subscription?.plan_id === 'solo' && sites.length >= 1 ? (
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700">
              Limit reached (1/1)
            </span>
            <Link href="/pricing">
              <Button variant="primary" className="text-sm">
                Upgrade
              </Button>
            </Link>
          </div>
        ) : (
          <Link href="/sites/new">
            <Button variant="primary" className="text-sm">
              Add New Site
            </Button>
          </Link>
        )}
      </div>

      {/* * Global Overview */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Total Sites</p>
          <p className="text-2xl font-bold text-neutral-900 dark:text-white">{sites.length}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Total Visitors (24h)</p>
          <p className="text-2xl font-bold text-neutral-900 dark:text-white">--</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-brand-orange/10 p-4 dark:border-neutral-800">
          <p className="text-sm text-brand-orange">Plan & usage</p>
          {subscriptionLoading ? (
            <p className="text-lg font-bold text-brand-orange">...</p>
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
              {(typeof subscription.sites_count === 'number' || (subscription.pageview_limit > 0 && typeof subscription.pageview_usage === 'number')) && (
                <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                  {typeof subscription.sites_count === 'number' && (
                    <span>Sites: {subscription.plan_id === 'solo' && subscription.sites_count > 0 ? `${subscription.sites_count}/1` : subscription.sites_count}</span>
                  )}
                  {typeof subscription.sites_count === 'number' && subscription.pageview_limit > 0 && typeof subscription.pageview_usage === 'number' && ' · '}
                  {subscription.pageview_limit > 0 && typeof subscription.pageview_usage === 'number' && (
                    <span>Pageviews: {subscription.pageview_usage.toLocaleString()}/{subscription.pageview_limit.toLocaleString()}</span>
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

      <SiteList sites={sites} loading={sitesLoading} onDelete={handleDelete} />
    </div>
  )
}
