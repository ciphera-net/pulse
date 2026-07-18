'use client'

import { useEffect } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { toast } from '@ciphera-net/facet'
import { ShieldWarning, Globe } from '@phosphor-icons/react'
import { useCan, type Permission } from '@/lib/auth/permissions'
import { useActiveSite } from '@/components/settings/active-site'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { EmptyState } from '@/components/ui/EmptyState'

const SiteGeneralTab      = dynamic(() => import('@/components/settings/unified/tabs/SiteGeneralTab'))
const SiteGoalsTab        = dynamic(() => import('@/components/settings/unified/tabs/SiteGoalsTab'))
const SiteVisibilityTab   = dynamic(() => import('@/components/settings/unified/tabs/SiteVisibilityTab'))
const SitePrivacyTab      = dynamic(() => import('@/components/settings/unified/tabs/SitePrivacyTab'))
const SiteBotSpamTab      = dynamic(() => import('@/components/settings/unified/tabs/SiteBotSpamTab'))
const SitePrivacyScanTab  = dynamic(() => import('@/components/settings/unified/tabs/SitePrivacyScanTab'))
const SiteReportsTab      = dynamic(() => import('@/components/settings/unified/tabs/SiteReportsTab'))
const SiteIntegrationsTab = dynamic(() => import('@/components/settings/unified/tabs/SiteIntegrationsTab'))

const SITE_TAB_PERMISSIONS: Record<string, Permission> = {
  general: 'sites.edit',
  goals: 'goals.manage',
  visibility: 'sites.edit',
  privacy: 'sites.edit',
  'bot-spam': 'quarantine.view',
  'privacy-scan': 'privacy_scan.manage',
  reports: 'reports.manage',
  integrations: 'integrations.manage',
}

const TAB_COMPONENTS: Record<string, React.ComponentType<{ siteId: string }>> = {
  general:        SiteGeneralTab,
  goals:          SiteGoalsTab,
  visibility:     SiteVisibilityTab,
  privacy:        SitePrivacyTab,
  'bot-spam':     SiteBotSpamTab,
  'privacy-scan': SitePrivacyScanTab,
  reports:        SiteReportsTab,
  integrations:   SiteIntegrationsTab,
}

const GSC_MESSAGES: Record<string, { type: 'success' | 'error'; text: string }> = {
  connected:   { type: 'success', text: 'Google Search Console connected successfully' },
  denied:      { type: 'error',   text: 'Google authorization was denied' },
  no_property: { type: 'error',   text: 'No matching Search Console property found for this site' },
  token_error: { type: 'error',   text: 'Failed to connect Google Search Console' },
  error:       { type: 'error',   text: 'Failed to connect Google Search Console' },
}

export default function SiteSettingsTabPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const tab = params.tab as string

  // The active site (and its picker) is now owned by the settings shell's
  // ActiveSiteProvider and surfaced in the SiteContextBand. This page just
  // consumes the resolved site and keeps its honest fetch-state branches.
  const { sites, activeSite, isLoading, error, mutate } = useActiveSite()

  const requiredPerm = SITE_TAB_PERMISSIONS[tab]
  const hasAccess = useCan(requiredPerm as Permission)

  const TabComponent = TAB_COMPONENTS[tab]

  // Handle GSC OAuth callback on the integrations tab.
  useEffect(() => {
    const gsc = searchParams.get('gsc')
    if (!gsc || tab !== 'integrations') return
    const msg = GSC_MESSAGES[gsc]
    if (msg) {
      if (msg.type === 'success') toast.success(msg.text)
      else toast.error(msg.text)
    }
    window.history.replaceState({}, '', '/settings/site/integrations')
  }, [searchParams, tab])

  // * Unknown tabs redirect to the section default instead of dead-ending on a
  // * raw fallback string.
  useEffect(() => {
    if (!TabComponent) router.replace('/settings/site/general')
  }, [TabComponent, router])

  // Honest fetch states — a failed /sites load is visibly distinct from a
  // genuine zero-site org, which is distinct from "still loading".
  if (error) {
    return (
      <SettingsErrorState
        message="We couldn't load your sites. This is usually a temporary problem."
        onRetry={() => mutate()}
      />
    )
  }

  if (isLoading && sites.length === 0) {
    return <SettingsLoadingState />
  }

  if (sites.length === 0) {
    return (
      <EmptyState
        icon={<Globe className="h-8 w-8 text-neutral-500" weight="regular" />}
        title="No sites yet"
        description="Create your first site to configure its analytics, privacy, and sharing settings."
        action={{ label: 'Create a site', href: '/sites/new' }}
      />
    )
  }

  // Sites loaded but the active id hasn't resolved yet (one render tick).
  if (!activeSite) {
    return <SettingsLoadingState />
  }

  if (requiredPerm && !hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldWarning className="mb-4 h-12 w-12 text-neutral-600" />
        <h3 className="mb-1 text-base font-semibold text-neutral-300">Access restricted</h3>
        <p className="max-w-sm text-sm text-neutral-500">
          You don&apos;t have permission to view this page. Contact your workspace owner to request access.
        </p>
      </div>
    )
  }

  return TabComponent ? <TabComponent siteId={activeSite.id} /> : null
}
