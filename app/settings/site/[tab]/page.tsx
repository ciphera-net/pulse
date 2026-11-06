'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { ShieldWarning, Globe } from '@phosphor-icons/react'
import { useCan, type Permission } from '@/lib/auth/permissions'
import { useActiveSite } from '@/components/settings/active-site'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { EmptyState } from '@/components/ui/EmptyState'

// The five site pages of the settings overhaul (PUL-42), each on today's route that carries most of its content.
const GeneralPage = dynamic(() => import('@/components/settings/pages/general/GeneralPage'))
const GoalsPage = dynamic(() => import('@/components/settings/pages/goals/GoalsPage'))
const SharingPage = dynamic(() => import('@/components/settings/pages/sharing/SharingPage'))
const PrivacyPage = dynamic(() => import('@/components/settings/pages/privacy/PrivacyPage'))
const DataPage = dynamic(() => import('@/components/settings/pages/data/DataPage'))

const TAB_COMPONENTS: Record<string, React.ComponentType<{ siteId: string }>> = {
  general: GeneralPage,
  goals: GoalsPage,
  visibility: SharingPage,
  privacy: PrivacyPage,
  integrations: DataPage,
}

/**
 * Routes a page took in: each lands on its page, with its query kept (the Google Analytics import's `?ga4=` callback
 * code and the Search Console `?gsc=` code are read by Data itself). Old links, bookmarks and emails keep working.
 */
const TAB_REDIRECTS: Record<string, string> = {
  monitoring: 'general',
  'bot-spam': 'general',
  import: 'integrations',
  export: 'integrations',
}

// Only General gates at the route: Goals, Sharing, Privacy and Data say who they are for in their own words (copy
// deck), and a member reads Sharing's lists and Data's import status (R23).
const SITE_TAB_PERMISSIONS: Record<string, Permission> = {
  general: 'sites.edit',
}

export default function SiteSettingsTabPage() {
  const params = useParams()
  const router = useRouter()
  const tab = params.tab as string

  // The active site (and its picker) is owned by the settings shell's ActiveSiteProvider and named in the header.
  const { sites, activeSite, isLoading, error, mutate } = useActiveSite()

  const requiredPerm = SITE_TAB_PERMISSIONS[tab]
  const hasAccess = useCan(requiredPerm as Permission)
  const TabComponent = TAB_COMPONENTS[tab]

  useEffect(() => {
    const target = TAB_REDIRECTS[tab]
    if (target) router.replace(`/settings/site/${target}${window.location.search}`)
    else if (!TabComponent) router.replace('/settings/site/general')
  }, [TabComponent, router, tab])

  if (!TabComponent) return null

  // A failed /sites load is visibly distinct from a team with no sites, which is distinct from still loading.
  if (error) {
    return <SettingsErrorState title="Couldn't load your sites" message="" onRetry={() => mutate()} />
  }
  if (isLoading && sites.length === 0) return <SettingsLoadingState />
  if (sites.length === 0) {
    return (
      <EmptyState
        icon={<Globe className="h-8 w-8 text-neutral-500" weight="regular" />}
        title="No sites yet"
        description="Add your first site to set up its tracking, privacy and sharing."
        action={{ label: 'Add a site', href: '/sites/new' }}
      />
    )
  }
  // Sites loaded but the active id hasn't resolved yet (one render tick).
  if (!activeSite) return <SettingsLoadingState />

  if (requiredPerm && !hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldWarning className="mb-4 h-12 w-12 text-neutral-600" />
        <h3 className="mb-1 text-base font-semibold text-neutral-300">Owners and admins only</h3>
        <p className="max-w-sm text-sm text-neutral-500">Ask an owner or admin of your team to change this page.</p>
      </div>
    )
  }

  // A page per site: switching sites remounts it, so no draft or open form carries over to another site.
  return <TabComponent key={activeSite.id} siteId={activeSite.id} />
}
