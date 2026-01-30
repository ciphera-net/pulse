'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth/context'
import { initiateOAuthFlow, initiateSignupFlow } from '@/lib/api/oauth'
import { listSites, deleteSite, type Site } from '@/lib/api/sites'
import { LoadingOverlay } from '@ciphera-net/ui'
import SiteList from '@/components/sites/SiteList'
import { Button } from '@ciphera-net/ui'
import { BarChartIcon, LockIcon, ZapIcon } from '@ciphera-net/ui'
import { toast } from '@ciphera-net/ui'

export default function HomePage() {
  const { user, loading: authLoading } = useAuth()
  const [sites, setSites] = useState<Site[]>([])
  const [sitesLoading, setSitesLoading] = useState(true)

  useEffect(() => {
    if (user?.org_id) {
      loadSites()
    }
  }, [user])

  const loadSites = async () => {
    try {
      setSitesLoading(true)
      const data = await listSites()
      setSites(Array.isArray(data) ? data : [])
    } catch (error: any) {
      toast.error('Failed to load sites: ' + (error.message || 'Unknown error'))
      setSites([])
    } finally {
      setSitesLoading(false)
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
      toast.error('Failed to delete site: ' + (error.message || 'Unknown error'))
    }
  }

  if (authLoading) {
    return <LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Pulse" portal={false} />
  }

  if (!user) {
    return (
      <div className="relative min-h-[calc(100vh-64px)] flex flex-col items-center justify-center overflow-hidden">
        
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

        <div className="w-full max-w-6xl mx-auto px-4 py-20 text-center z-10">
          
          {/* * --- 2. BADGE --- */}
          <div className="inline-flex justify-center mb-8 animate-fade-in">
            <span className="badge-primary">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-orange animate-pulse" />
              Privacy-First Analytics
            </span>
          </div>

          {/* * --- 3. HEADLINE --- */}
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-neutral-900 dark:text-white mb-6">
            Simple analytics for <br />
            <span className="relative inline-block">
              <span className="gradient-text">privacy-conscious</span>
              {/* * SVG Underline from Main Site */}
              <svg className="absolute -bottom-2 left-0 w-full h-3 text-brand-orange/30" viewBox="0 0 200 12" preserveAspectRatio="none">
                <path d="M0 9C50 3 150 3 200 9" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
              </svg>
            </span>
            {' '}apps.
          </h1>

          <p className="text-xl text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Respect your users' privacy while getting the insights you need. 
            No cookies, no IP tracking, fully GDPR compliant.
          </p>

          {/* * --- 4. CTAs --- */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-20">
            <Button onClick={() => initiateOAuthFlow()} className="btn-primary px-8 py-4 text-lg shadow-lg shadow-brand-orange/20">
              Get Started
            </Button>
            <Button variant="secondary" onClick={() => initiateSignupFlow()} className="btn-secondary px-8 py-4 text-lg backdrop-blur-sm">
              Create Account
            </Button>
          </div>

          {/* * --- 5. GLASS CARDS --- */}
          <div className="grid md:grid-cols-3 gap-6 text-left">
            {[
              { icon: LockIcon, title: "Privacy First", desc: "We don't track personal data. No IP addresses, no fingerprints, no cookies." },
              { icon: BarChartIcon, title: "Simple Insights", desc: "Get the metrics that matter without the clutter. Page views, visitors, and sources." },
              { icon: ZapIcon, title: "Lightweight", desc: "Our script is less than 1kb. It won't slow down your site or affect your SEO." }
            ].map((feature, i) => (
              <div key={i} className="card-glass p-8 hover:-translate-y-1 hover:shadow-xl transition-all duration-300 group">
                <div className="w-12 h-12 rounded-xl bg-brand-orange/10 flex items-center justify-center mb-6 text-brand-orange group-hover:scale-110 transition-transform duration-300">
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-3">{feature.title}</h3>
                <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>

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
        <Link href="/sites/new" className="btn-primary text-sm">Add New Site</Link>
      </div>

      {/* * Global Overview */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Total Sites</p>
          <p className="text-2xl font-bold text-neutral-900 dark:text-white">{sites.length}</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Total Visitors (24h)</p>
          <p className="text-2xl font-bold text-neutral-900 dark:text-white">--</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-brand-orange/10 p-4 dark:border-neutral-800">
          <p className="text-sm text-brand-orange">Plan Status</p>
          <p className="text-lg font-bold text-brand-orange">Pro Plan</p>
        </div>
      </div>

      <SiteList sites={sites} loading={sitesLoading} onDelete={handleDelete} />
    </div>
  )
}
