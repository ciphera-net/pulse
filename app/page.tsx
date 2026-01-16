'use client'

import { useAuth } from '@/lib/auth/context'
import { initiateOAuthFlow, initiateSignupFlow } from '@/lib/api/oauth'
import LoadingOverlay from '@/components/LoadingOverlay'
import SiteList from '@/components/sites/SiteList'
import { Button } from '@ciphera-net/ui'
import { BarChartIcon, LockClosedIcon, LightningBoltIcon } from '@radix-ui/react-icons'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  if (loading) {
    return <LoadingOverlay logoSrc="/ciphera_icon_no_margins.png" title="Ciphera Analytics" />
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
            Privacy-First Analytics
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
            <div className="p-6 rounded-2xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
              <div className="w-12 h-12 bg-brand-orange/10 rounded-xl flex items-center justify-center mb-4 text-brand-orange">
                <LockClosedIcon className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-2">Privacy First</h3>
              <p className="text-neutral-600 dark:text-neutral-400">
                We don't track personal data. No IP addresses, no fingerprints, no cookies.
              </p>
            </div>
            <div className="p-6 rounded-2xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
              <div className="w-12 h-12 bg-brand-orange/10 rounded-xl flex items-center justify-center mb-4 text-brand-orange">
                <BarChartIcon className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-2">Simple Insights</h3>
              <p className="text-neutral-600 dark:text-neutral-400">
                Get the metrics that matter without the clutter. Page views, visitors, and sources.
              </p>
            </div>
            <div className="p-6 rounded-2xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
              <div className="w-12 h-12 bg-brand-orange/10 rounded-xl flex items-center justify-center mb-4 text-brand-orange">
                <LightningBoltIcon className="w-6 h-6" />
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

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 dark:text-white mb-2">
            Your Sites
          </h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            Manage your analytics sites and view insights
          </p>
        </div>
        <Button onClick={() => router.push('/sites/new')}>
          + Add New Site
        </Button>
      </div>
      <SiteList />
    </div>
  )
}
