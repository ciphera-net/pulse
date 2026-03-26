'use client'

import { useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { toast } from '@ciphera-net/ui'
import { useUnifiedSettings } from '@/lib/unified-settings-context'
import { useGSCStatus } from '@/lib/swr/dashboard'
import { Spinner } from '@ciphera-net/ui'

/**
 * Legacy settings page — now a redirect handler.
 *
 * The unified settings modal has replaced the full-page settings.
 * This page only exists to handle:
 * 1. GSC OAuth callbacks (?gsc=connected|denied|error|no_property)
 * 2. Deep links with ?tab= params
 * 3. Direct navigation — redirects to site dashboard and opens modal
 */
export default function SettingsRedirect() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const siteId = params.id as string
  const { openUnifiedSettings } = useUnifiedSettings()
  const { mutate: mutateGSCStatus } = useGSCStatus(siteId)

  useEffect(() => {
    const gsc = searchParams.get('gsc')
    const tab = searchParams.get('tab')

    // Handle GSC OAuth callback
    if (gsc) {
      switch (gsc) {
        case 'connected':
          toast.success('Google Search Console connected successfully')
          mutateGSCStatus()
          break
        case 'denied':
          toast.error('Google authorization was denied')
          break
        case 'no_property':
          toast.error('No matching Search Console property found for this site')
          break
        case 'token_error':
        case 'error':
          toast.error('Failed to connect Google Search Console')
          break
      }
      // Redirect to site page and open integrations tab
      router.replace(`/sites/${siteId}`)
      setTimeout(() => openUnifiedSettings({ context: 'site', tab: 'integrations' }), 100)
      return
    }

    // Handle deep links with ?tab= param
    const tabMap: Record<string, string> = {
      general: 'general',
      visibility: 'visibility',
      data: 'privacy',
      privacy: 'privacy',
      bot: 'bot-spam',
      goals: 'goals',
      notifications: 'reports',
      integrations: 'integrations',
    }

    const mappedTab = tab ? tabMap[tab] || 'general' : 'general'
    router.replace(`/sites/${siteId}`)
    setTimeout(() => openUnifiedSettings({ context: 'site', tab: mappedTab }), 100)
  }, [siteId, searchParams, router, openUnifiedSettings, mutateGSCStatus])

  return (
    <div className="flex items-center justify-center py-24">
      <Spinner className="w-6 h-6 text-neutral-500" />
    </div>
  )
}
