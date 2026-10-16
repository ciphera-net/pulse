'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'

const AccountProfileTab  = dynamic(() => import('@/components/settings/unified/tabs/AccountProfileTab'))
const AccountSecurityTab = dynamic(() => import('@/components/settings/unified/tabs/AccountSecurityTab'))
const AccountDevicesTab  = dynamic(() => import('@/components/settings/unified/tabs/AccountDevicesTab'))
// * Personal notification preferences live under Account (IA move, spec §5.2).
// * Since 21-09-2026 the page is one email switch per category; the digest,
// * quiet hours, mute and retention controls it used to carry are retired.
const MyPreferencesTab   = dynamic(() => import('@/components/settings/notifications/MyPreferencesTab'))

const TAB_COMPONENTS: Record<string, React.ComponentType> = {
  profile:       AccountProfileTab,
  security:      AccountSecurityTab,
  devices:       AccountDevicesTab,
  notifications: MyPreferencesTab,
}

// * Old slugs that moved. "security-alerts" folded into Notifications
// * (16-10-2026, OPS-17): Ciphera ID's own account alerts are now a panel on
// * that tab, so a bookmark to the old address still lands on the alerts.
const TAB_ALIASES: Record<string, string> = {
  'security-alerts': 'notifications',
}

export default function AccountSettingsTabPage() {
  const params = useParams()
  const router = useRouter()
  const tab = params.tab as string

  const TabComponent = TAB_COMPONENTS[tab]

  // * Unknown tabs never dead-end on a raw fallback string — redirect to the
  // * section default.
  useEffect(() => {
    const alias = TAB_ALIASES[tab]
    if (alias) router.replace(`/settings/account/${alias}`)
    else if (!TabComponent) router.replace('/settings/account/profile')
  }, [TabComponent, router, tab])

  if (!TabComponent) return null

  return <TabComponent />
}
