'use client'

import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { useEffect } from 'react'

const TAB_MAP: Record<string, string> = {
  general:       'general',
  visibility:    'visibility',
  data:          'privacy',
  privacy:       'privacy',
  bot:           'bot-spam',
  goals:         'goals',
  notifications: 'reports',
  integrations:  'integrations',
}

export default function SiteSettingsRedirect() {
  const params = useParams()
  const siteId = params.id as string
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    sessionStorage.setItem('pulse_active_site', siteId)
    const gsc = searchParams.get('gsc')
    if (gsc) {
      router.replace(`/settings/site/integrations?gsc=${gsc}`)
      return
    }
    const tabParam = searchParams.get('tab')
    const tab = tabParam ? (TAB_MAP[tabParam] ?? 'general') : 'general'
    router.replace(`/settings/site/${tab}`)
  }, [siteId, searchParams, router])

  return null
}
