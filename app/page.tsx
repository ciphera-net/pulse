'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { listSites } from '@/lib/api/sites'
import type { Site } from '@/lib/api/sites'
import LoadingOverlay from '@/components/LoadingOverlay'
import SiteList from '@/components/sites/SiteList'

export default function HomePage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  if (loading) {
    return <LoadingOverlay logoSrc="/ciphera_icon_no_margins.png" title="Ciphera Analytics" />
  }

  if (!user) {
    return null
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
