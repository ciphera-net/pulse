'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useUnifiedSettings } from '@/lib/unified-settings-context'
import { Spinner } from '@ciphera-net/ui'

function OrgSettingsInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { openUnifiedSettings } = useUnifiedSettings()

  useEffect(() => {
    const tab = searchParams.get('tab')

    const tabMap: Record<string, string> = {
      general: 'general',
      members: 'members',
      billing: 'billing',
      notifications: 'notifications',
      audit: 'audit',
    }

    const mappedTab = tab ? tabMap[tab] || 'general' : 'general'
    router.replace('/')
    setTimeout(() => openUnifiedSettings({ context: 'workspace', tab: mappedTab }), 100)
  }, [searchParams, router, openUnifiedSettings])

  return (
    <div className="flex items-center justify-center py-24">
      <Spinner className="w-6 h-6 text-neutral-500" />
    </div>
  )
}

export default function OrgSettingsRedirect() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-24"><Spinner className="w-6 h-6 text-neutral-500" /></div>}>
      <OrgSettingsInner />
    </Suspense>
  )
}
