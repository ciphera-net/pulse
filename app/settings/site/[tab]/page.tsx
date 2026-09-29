'use client'

import { useEffect } from 'react'
import { notFound, useParams, useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { toast } from '@ciphera-net/facet'
import { ShieldWarning, Globe } from '@phosphor-icons/react'
import { useCan, type Permission } from '@/lib/auth/permissions'
import { useActiveSite } from '@/components/settings/active-site'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { EmptyState } from '@/components/ui/EmptyState'
import { useImportSources } from '@/lib/import/useImportSources'

const SiteGeneralTab      = dynamic(() => import('@/components/settings/unified/tabs/SiteGeneralTab'))
const SiteGoalsTab        = dynamic(() => import('@/components/settings/unified/tabs/SiteGoalsTab'))
const SiteVisibilityTab   = dynamic(() => import('@/components/settings/unified/tabs/SiteVisibilityTab'))
const SitePrivacyTab      = dynamic(() => import('@/components/settings/unified/tabs/SitePrivacyTab'))
const SiteBotSpamTab      = dynamic(() => import('@/components/settings/unified/tabs/SiteBotSpamTab'))
const SiteIntegrationsTab = dynamic(() => import('@/components/settings/unified/tabs/SiteIntegrationsTab'))
const SiteMonitoringTab   = dynamic(() => import('@/components/settings/unified/tabs/SiteMonitoringTab'))
const SiteImportTab       = dynamic(() => import('@/components/settings/unified/tabs/SiteImportTab'))
const SiteExportTab       = dynamic(() => import('@/components/settings/unified/tabs/SiteExportTab'))

const SITE_TAB_PERMISSIONS: Record<string, Permission> = {
  general: 'sites.edit',
  goals: 'goals.manage',
  visibility: 'sites.edit',
  privacy: 'sites.edit',
  integrations: 'integrations.manage',
  // Export (PULSE-132): the permission the download route itself requires, so
  // a member without it gets the standard "Access restricted" state here and
  // never a form whose every download would 403.
  export: 'analytics.export',
}

const TAB_COMPONENTS: Record<string, React.ComponentType<{ siteId: string }>> = {
  general:        SiteGeneralTab,
  goals:          SiteGoalsTab,
  visibility:     SiteVisibilityTab,
  privacy:        SitePrivacyTab,
  'bot-spam':     SiteBotSpamTab,
  // Like bot-spam: no SITE_TAB_PERMISSIONS entry, so every member can read it;
  // the enable/disable action gates on uptime.manage inside the tab.
  monitoring:     SiteMonitoringTab,
  integrations:   SiteIntegrationsTab,
  // Import (PULSE-118, owner ruling Q-M11): deliberately NO SITE_TAB_PERMISSIONS
  // entry. Every member reads an import's status (§3.9); the write controls
  // gate on integrations.manage inside the tab. The tab exists only where the
  // server lists an import source (M11-b, below).
  import:         SiteImportTab,
  export:         SiteExportTab,
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

  // The active site (and its picker) is owned by the settings shell's
  // ActiveSiteProvider and surfaced in the header (SiteHeaderIdentity). This page just
  // consumes the resolved site and keeps its honest fetch-state branches.
  const { sites, activeSite, isLoading, error, mutate } = useActiveSite()

  const requiredPerm = SITE_TAB_PERMISSIONS[tab]
  const hasAccess = useCan(requiredPerm as Permission)

  const TabComponent = TAB_COMPONENTS[tab]

  // The Import tab exists only where imports exist (M11-b): the server answers
  // GET …/data-imports/sources with a plain 404 while imports are off, and this
  // build shows a source only when it can drive it. Read for every tab (a hook
  // cannot be conditional); the site id is withheld on the others, so nothing is
  // fetched there.
  const importSources = useImportSources(tab === 'import' ? activeSite?.id : null)

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
          You don&apos;t have permission to view this page. Contact your team owner to request access.
        </p>
      </div>
    )
  }

  if (tab === 'import') {
    if (importSources.status === 'loading') return <SettingsLoadingState />
    if (importSources.status === 'error') {
      return (
        <SettingsErrorState
          message="We couldn't check whether this site can import history. This is usually a temporary problem."
          onRetry={importSources.retry}
        />
      )
    }
    // A direct visit where imports don't exist: the standard not-found state,
    // never an empty tab and never a hint that the feature exists.
    if (importSources.status === 'unavailable') notFound()
  }

  return TabComponent ? <TabComponent siteId={activeSite.id} /> : null
}
