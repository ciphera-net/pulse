'use client'

import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { useEffect } from 'react'

const TAB_MAP: Record<string, string> = {
  general:       'general',
  visibility:    'visibility',
  data:          'privacy',
  privacy:       'privacy',
  bot:           'general',
  goals:         'goals',
  integrations:  'integrations',
  // PULSE-121, design §3.10c M13-h: the M13 import notifications' link_url is
  // `/sites/:id/settings?tab=import` (pulse-backend's ImportTabURL). Import is
  // part of Data since the settings overhaul.
  import:        'integrations',
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
    // M5 (PULSE-140), design §3.12m5a constraint 1: GA4's callback lands the
    // Google popup here with `?tab=import&ga4=<code>`. The Import tab says the
    // code, so it must survive the redirect, as `gsc` does. Data reads both.
    const ga4 = searchParams.get('ga4')
    if (ga4) {
      router.replace(`/settings/site/integrations?ga4=${encodeURIComponent(ga4)}`)
      return
    }
    const tabParam = searchParams.get('tab')
    const tab = tabParam ? (TAB_MAP[tabParam] ?? 'general') : 'general'
    router.replace(`/settings/site/${tab}`)
  }, [siteId, searchParams, router])

  return null
}
