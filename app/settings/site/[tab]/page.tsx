'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useSites } from '@/lib/swr/sites'
import { Select, toast } from '@ciphera-net/ui'
import { FAVICON_SERVICE_URL } from '@/lib/utils/favicon'

const SiteGeneralTab      = dynamic(() => import('@/components/settings/unified/tabs/SiteGeneralTab'))
const SiteGoalsTab        = dynamic(() => import('@/components/settings/unified/tabs/SiteGoalsTab'))
const SiteVisibilityTab   = dynamic(() => import('@/components/settings/unified/tabs/SiteVisibilityTab'))
const SitePrivacyTab      = dynamic(() => import('@/components/settings/unified/tabs/SitePrivacyTab'))
const SiteBotSpamTab      = dynamic(() => import('@/components/settings/unified/tabs/SiteBotSpamTab'))
const SitePrivacyScanTab  = dynamic(() => import('@/components/settings/unified/tabs/SitePrivacyScanTab'))
const SiteReportsTab      = dynamic(() => import('@/components/settings/unified/tabs/SiteReportsTab'))
const SiteIntegrationsTab = dynamic(() => import('@/components/settings/unified/tabs/SiteIntegrationsTab'))

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
  const { sites } = useSites()

  const [activeSiteId, setActiveSiteId] = useState<string | null>(null)

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

  if (sites.length === 0 || !activeSiteId) {
    return null
  }

  const TabComponent = TAB_COMPONENTS[tab]

  const siteOptions = sites.map((s) => ({ value: s.id, label: s.domain }))
  const activeSite = sites.find((s) => s.id === activeSiteId) ?? sites[0]

  return (
    <>
      {sites.length > 1 ? (
        <div className="mb-6 flex items-center gap-3">
          <img
            src={`${FAVICON_SERVICE_URL}?domain=${activeSite.domain}&sz=32`}
            alt=""
            width={20}
            height={20}
            className="rounded-sm"
          />
          <Select
            value={activeSiteId}
            onChange={(id: string) => {
              setActiveSiteId(id)
              if (typeof window !== 'undefined') sessionStorage.setItem('pulse_active_site', id)
            }}
            options={siteOptions}
            variant="ghost"
            className="text-white font-medium"
          />
        </div>
      ) : sites.length === 1 ? (
        <div className="mb-6 flex items-center gap-3">
          <img
            src={`${FAVICON_SERVICE_URL}?domain=${sites[0].domain}&sz=32`}
            alt=""
            width={20}
            height={20}
            className="rounded-sm"
          />
          <span className="text-sm font-medium text-white">{sites[0].domain}</span>
        </div>
      ) : null}

      {TabComponent ? (
        <TabComponent siteId={activeSiteId} />
      ) : (
        <p className="text-sm text-neutral-400">Unknown settings tab.</p>
      )}
    </>
  )
}
