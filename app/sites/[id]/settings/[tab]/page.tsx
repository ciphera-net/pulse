'use client'

import { useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { toast } from '@ciphera-net/ui'

const SiteGeneralTab     = dynamic(() => import('@/components/settings/unified/tabs/SiteGeneralTab'))
const SiteGoalsTab       = dynamic(() => import('@/components/settings/unified/tabs/SiteGoalsTab'))
const SiteVisibilityTab  = dynamic(() => import('@/components/settings/unified/tabs/SiteVisibilityTab'))
const SitePrivacyTab     = dynamic(() => import('@/components/settings/unified/tabs/SitePrivacyTab'))
const SiteBotSpamTab     = dynamic(() => import('@/components/settings/unified/tabs/SiteBotSpamTab'))
const SitePrivacyScanTab = dynamic(() => import('@/components/settings/unified/tabs/SitePrivacyScanTab'))
const SiteReportsTab     = dynamic(() => import('@/components/settings/unified/tabs/SiteReportsTab'))
const SiteIntegrationsTab = dynamic(() => import('@/components/settings/unified/tabs/SiteIntegrationsTab'))

const TAB_COMPONENTS: Record<string, React.ComponentType<{ siteId: string }>> = {
  general:      SiteGeneralTab,
  goals:        SiteGoalsTab,
  visibility:   SiteVisibilityTab,
  privacy:      SitePrivacyTab,
  'bot-spam':   SiteBotSpamTab,
  'privacy-scan': SitePrivacyScanTab,
  reports:      SiteReportsTab,
  integrations: SiteIntegrationsTab,
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

  const siteId = params.id as string
  const tab = params.tab as string

  useEffect(() => {
    const gsc = searchParams.get('gsc')
    if (!gsc || tab !== 'integrations') return

    const msg = GSC_MESSAGES[gsc]
    if (msg) {
      if (msg.type === 'success') toast.success(msg.text)
      else toast.error(msg.text)
    }
    window.history.replaceState({}, '', `/sites/${siteId}/settings/integrations`)
  }, [searchParams, tab, siteId])

  const TabComponent = TAB_COMPONENTS[tab]

  if (!TabComponent) {
    return <p className="text-sm text-neutral-400">Unknown settings tab.</p>
  }

  return <TabComponent siteId={siteId} />
}
