'use client'

import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'

const AccountProfileTab  = dynamic(() => import('@/components/settings/unified/tabs/AccountProfileTab'))
const AccountSecurityTab = dynamic(() => import('@/components/settings/unified/tabs/AccountSecurityTab'))
const AccountDevicesTab  = dynamic(() => import('@/components/settings/unified/tabs/AccountDevicesTab'))

const TAB_COMPONENTS: Record<string, React.ComponentType> = {
  profile:  AccountProfileTab,
  security: AccountSecurityTab,
  devices:  AccountDevicesTab,
}

export default function AccountSettingsTabPage() {
  const params = useParams()
  const tab = params.tab as string

  const TabComponent = TAB_COMPONENTS[tab]

  if (!TabComponent) {
    return <p className="text-sm text-neutral-400">Unknown settings tab.</p>
  }

  return <TabComponent />
}
