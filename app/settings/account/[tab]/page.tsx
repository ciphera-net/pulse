'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'

const AccountProfileTab  = dynamic(() => import('@/components/settings/unified/tabs/AccountProfileTab'))
const AccountSecurityTab = dynamic(() => import('@/components/settings/unified/tabs/AccountSecurityTab'))
const AccountDevicesTab  = dynamic(() => import('@/components/settings/unified/tabs/AccountDevicesTab'))

const TAB_COMPONENTS: Record<string, React.ComponentType> = {
  profile:  AccountProfileTab,
  security: AccountSecurityTab,
  devices:  AccountDevicesTab,
}

// * Tabs that exist conceptually but live elsewhere. Personal notification
// * preferences are the "My preferences" sub-tab of the organization section.
const TAB_REDIRECTS: Record<string, string> = {
  notifications: '/settings/organization/notifications',
}

export default function AccountSettingsTabPage() {
  const params = useParams()
  const router = useRouter()
  const tab = params.tab as string

  const TabComponent = TAB_COMPONENTS[tab]

  // * Unknown tabs never dead-end on a raw fallback string — redirect to the
  // * canonical location or the section default.
  useEffect(() => {
    if (!TabComponent) router.replace(TAB_REDIRECTS[tab] ?? '/settings/account/profile')
  }, [TabComponent, tab, router])

  if (!TabComponent) return null

  return <TabComponent />
}
