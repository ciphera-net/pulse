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
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] py-12 px-4">
        {/* Hero Section */}
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-orange/10 text-brand-orange text-sm font-medium mb-4">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-orange opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-orange"></span>
            </span>
            Privacy-First Pulse
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Simple analytics for <br />
            <span className="text-brand-orange">privacy-conscious</span> apps.
          </h1>
          
          <p className="text-xl text-neutral-600 dark:text-neutral-400 max-w-2xl mx-auto leading-relaxed">
            Respect your users' privacy while getting the insights you need. 
            No cookies, no IP tracking, fully GDPR compliant.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
            <Button
              onClick={() => initiateOAuthFlow()}
              className="px-8 py-6 text-lg min-w-[200px]"
            >
              Get Started
            </Button>
            <Button
              variant="secondary"
              onClick={() => initiateSignupFlow()}
              className="px-8 py-6 text-lg min-w-[200px]"
            >
              Create Account
            </Button>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-3 gap-8 pt-16 text-left">
            <div className="p-6 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
              <div className="w-12 h-12 bg-brand-orange/10 rounded-xl flex items-center justify-center mb-4 text-brand-orange">
                <LockIcon className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-2">Privacy First</h3>
              <p className="text-neutral-600 dark:text-neutral-400">
                We don't track personal data. No IP addresses, no fingerprints, no cookies.
              </p>
            </div>
            <div className="p-6 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
              <div className="w-12 h-12 bg-brand-orange/10 rounded-xl flex items-center justify-center mb-4 text-brand-orange">
                <BarChartIcon className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-2">Simple Insights</h3>
              <p className="text-neutral-600 dark:text-neutral-400">
                Get the metrics that matter without the clutter. Page views, visitors, and sources.
              </p>
            </div>
            <div className="p-6 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
              <div className="w-12 h-12 bg-brand-orange/10 rounded-xl flex items-center justify-center mb-4 text-brand-orange">
                <ZapIcon className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-2">Lightweight</h3>
              <p className="text-neutral-600 dark:text-neutral-400">
                Our script is less than 1kb. It won't slow down your site or affect your SEO.
              </p>
            </div>
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
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Your Sites</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Manage your analytics sites and view insights.</p>
        </div>
        <Link href="/sites/new" className="btn-primary text-sm">Add New Site</Link>
      </div>

      {/* Global Overview */}
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