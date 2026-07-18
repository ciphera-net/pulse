'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useSites } from '@/lib/swr/sites'
import { toast } from '@ciphera-net/facet'
import { CaretDown, ShieldWarning, Globe } from '@phosphor-icons/react'
import { SiteFavicon } from '@/components/sites/SiteFavicon'
import { useCan, type Permission } from '@/lib/auth/permissions'
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
  const { sites, isLoading: sitesLoading, error: sitesError, mutate: mutateSites } = useSites()

  const [activeSiteId, setActiveSiteId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [siteSearch, setSiteSearch] = useState('')

  const requiredPerm = SITE_TAB_PERMISSIONS[tab]
  const hasAccess = useCan(requiredPerm as Permission)

  const filteredSites = siteSearch.trim()
    ? sites.filter(s => s.name.toLowerCase().includes(siteSearch.toLowerCase()) || s.domain.toLowerCase().includes(siteSearch.toLowerCase()))
    : sites

  // Initialise site from sessionStorage, fall back to first site
  useEffect(() => {
    if (sites.length === 0) return
    const stored = typeof window !== 'undefined' ? sessionStorage.getItem('pulse_active_site') : null
    const valid = stored && sites.some((s) => s.id === stored)
    const id = valid ? stored! : sites[0].id
    setActiveSiteId(id)
    // Persist the resolved id
    if (typeof window !== 'undefined') sessionStorage.setItem('pulse_active_site', id)
  }, [sites])

  // Handle GSC OAuth callback on integrations tab
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

  // Close site picker on outside click
  useEffect(() => {
    if (!pickerOpen) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-site-picker]')) {
        setPickerOpen(false)
        setSiteSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pickerOpen])

  const TabComponent = TAB_COMPONENTS[tab]

  // * Unknown tabs redirect to the section default instead of dead-ending on a
  // * raw fallback string. This hook MUST stay above the early return below:
  // * `sites` loads async (empty → resolved), so a hook placed after the guard
  // * changes the render's hook count when sites arrive → React error #310.
  useEffect(() => {
    if (!TabComponent) router.replace('/settings/site/general')
  }, [TabComponent, router])

  // Honest fetch states — a failed /sites load previously fell through to the
  // same blank pane as "still loading" (silent failure); a zero-site org got a
  // blank content pane inside the full settings chrome with no way forward.
  if (sitesError) {
    return (
      <SettingsErrorState
        message="We couldn't load your sites. This is usually a temporary problem."
        onRetry={() => mutateSites()}
      />
    )
  }

  if (sitesLoading && sites.length === 0) {
    return <SettingsLoadingState />
  }

  if (sites.length === 0) {
    return (
      <EmptyState
        icon={<Globe className="w-8 h-8 text-neutral-500" weight="regular" />}
        title="No sites yet"
        description="Create your first site to configure its analytics, privacy, and sharing settings."
        action={{ label: 'Create a site', href: '/sites/new' }}
      />
    )
  }

  // Sites loaded but the active id hasn't resolved yet (one render tick).
  if (!activeSiteId) {
    return <SettingsLoadingState />
  }

  const activeSite = sites.find((s) => s.id === activeSiteId) ?? sites[0]

  return (
    <>
      <div data-site-picker>
        <button
          onClick={() => setPickerOpen(!pickerOpen)}
          className="w-full flex items-center gap-3 px-4 py-3 mb-6 rounded-none border border-neutral-800 bg-neutral-800/30 hover:border-neutral-700 transition-colors ease-apple cursor-pointer"
        >
          <SiteFavicon
            domain={activeSite.domain}
            name={activeSite.name}
            size={24}
            className="w-6 h-6 rounded-none object-contain shrink-0"
          />
          <div className="flex flex-col items-start min-w-0">
            <span className="text-sm font-medium text-white truncate">{activeSite.name}</span>
            <span className="text-xs text-neutral-500 truncate">{activeSite.domain}</span>
          </div>
          {sites.length > 1 && (
            <CaretDown className="w-4 h-4 text-neutral-500 ml-auto shrink-0" weight="bold" />
          )}
        </button>

        {pickerOpen && sites.length > 1 && (
          <div className="mb-6 -mt-4 rounded-none border border-neutral-800 bg-card border-border overflow-hidden">
            <div className="p-2">
              <input
                type="text"
                placeholder="Search sites..."
                value={siteSearch}
                onChange={(e) => setSiteSearch(e.target.value)}
                className="w-full px-3 py-1.5 text-sm bg-white/[0.04] border border-neutral-800 rounded-none outline-none focus:ring-2 focus:ring-brand-orange/40 text-white placeholder:text-neutral-400"
                autoFocus
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filteredSites.map((site) => (
                <button
                  key={site.id}
                  onClick={() => {
                    setActiveSiteId(site.id)
                    sessionStorage.setItem('pulse_active_site', site.id)
                    setPickerOpen(false)
                    setSiteSearch('')
                  }}
                  className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left transition-colors ease-apple ${
                    site.id === activeSiteId
                      ? 'bg-brand-orange/10 text-brand-orange font-medium'
                      : 'text-neutral-300 hover:bg-white/[0.06]'
                  }`}
                >
                  <SiteFavicon
                    domain={site.domain}
                    name={site.name}
                    size={20}
                    className="w-5 h-5 rounded-none object-contain shrink-0"
                  />
                  <span className="flex flex-col min-w-0">
                    <span className="truncate">{site.name}</span>
                    <span className="text-xs text-neutral-400 truncate">{site.domain}</span>
                  </span>
                </button>
              ))}
              {filteredSites.length === 0 && (
                <p className="text-sm text-neutral-500 text-center py-4">No sites found</p>
              )}
            </div>
          </div>
        )}
      </div>

      {requiredPerm && !hasAccess ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ShieldWarning className="w-12 h-12 text-neutral-600 mb-4" />
          <h3 className="text-base font-semibold text-neutral-300 mb-1">Access restricted</h3>
          <p className="text-sm text-neutral-500 max-w-sm">You don&apos;t have permission to view this page. Contact your workspace owner to request access.</p>
        </div>
      ) : TabComponent ? (
        <TabComponent siteId={activeSiteId} />
      ) : null}
    </>
  )
}
