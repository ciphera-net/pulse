'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useCan } from '@/lib/auth/permissions'
import { useActiveSite } from '@/components/settings/active-site'
import { landingPage, pagesVisibleTo } from '@/components/settings/nav'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'

/**
 * Where `/settings` lands: the first page of the one list (settings overhaul R3, 05-11-2026: "the /settings landing
 * page goes"; one list needs no index). The breadcrumb's Settings and every older link to `/settings` arrive here.
 * While the sites are loading nothing is decided, so the redirect never lands somewhere and then moves.
 */
export default function SettingsIndexPage() {
  const router = useRouter()
  const { sites, isLoading } = useActiveSite()
  const pages = pagesVisibleTo({
    'sites.edit': useCan('sites.edit'),
    'goals.manage': useCan('goals.manage'),
    'billing.view': useCan('billing.view'),
    'integrations.manage': useCan('integrations.manage'),
  })
  const target = isLoading ? undefined : landingPage(pages, sites.length > 0)

  useEffect(() => {
    if (target) router.replace(target.href)
  }, [router, target])

  return <SettingsLoadingState rows={3} />
}
