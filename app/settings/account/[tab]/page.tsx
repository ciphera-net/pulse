'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'

const AccountProfileTab  = dynamic(() => import('@/components/settings/unified/tabs/AccountProfileTab'))
const AccountSecurityTab = dynamic(() => import('@/components/settings/unified/tabs/AccountSecurityTab'))
const AccountDevicesTab  = dynamic(() => import('@/components/settings/unified/tabs/AccountDevicesTab'))
// * Personal notification preferences now live under Account (IA move, spec §5.2).
// * The delivery matrix, digest, quiet hours, and retention overrides that used
// * to be the org section's "My preferences" sub-tab render here directly.
const MyPreferencesTab   = dynamic(() => import('@/components/settings/notifications/MyPreferencesTab'))

const TAB_COMPONENTS: Record<string, React.ComponentType> = {
  profile:       AccountProfileTab,
  security:      AccountSecurityTab,
  devices:       AccountDevicesTab,
  notifications: MyPreferencesTab,
}

export default function AccountSettingsTabPage() {
  const params = useParams()
  const router = useRouter()
  const tab = params.tab as string

  const TabComponent = TAB_COMPONENTS[tab]

  // * Unknown tabs never dead-end on a raw fallback string — redirect to the
  // * section default.
  useEffect(() => {
    if (!TabComponent) router.replace('/settings/account/profile')
  }, [TabComponent, router])

  if (!TabComponent) return null

  return <TabComponent />
}
