'use client'

import { useAuth } from '@/lib/auth/context'
import { initiateOAuthFlow } from '@/lib/api/oauth'
import LoadingOverlay from '@/components/LoadingOverlay'
import SiteList from '@/components/sites/SiteList'

export default function HomePage() {
  const { user, loading } = useAuth()

  if (loading) {
    return <LoadingOverlay logoSrc="/ciphera_icon_no_margins.png" title="Ciphera Analytics" />
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto text-center py-16">
          <h1 className="text-4xl font-bold text-neutral-900 dark:text-white mb-4">
            Welcome to Ciphera Analytics
          </h1>
          <p className="text-lg text-neutral-600 dark:text-neutral-400 mb-8">
            Privacy-first web analytics. No cookies, no tracking. GDPR compliant.
          </p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => initiateOAuthFlow()}
              className="btn-primary"
            >
              Sign In
            </button>
            <button
              onClick={() => {
                const authUrl = process.env.NEXT_PUBLIC_AUTH_URL || 'https://auth.ciphera.net'
                window.location.href = `${authUrl}/signup?client_id=analytics-app&redirect_uri=${encodeURIComponent((process.env.NEXT_PUBLIC_APP_URL || window.location.origin) + '/auth/callback')}&response_type=code`
              }}
              className="btn-secondary"
            >
              Sign Up
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-white mb-2">
          Your Sites
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          Manage your analytics sites and view insights
        </p>
      </div>
      <SiteList />
    </div>
  )
}
