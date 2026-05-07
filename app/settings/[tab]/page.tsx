'use client'

import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'

const WorkspaceGeneralTab  = dynamic(() => import('@/components/settings/unified/tabs/WorkspaceGeneralTab'))
const WorkspaceMembersTab  = dynamic(() => import('@/components/settings/unified/tabs/WorkspaceMembersTab'))
const WorkspaceBillingTab  = dynamic(() => import('@/components/settings/unified/tabs/WorkspaceBillingTab'))
const NotificationsTab     = dynamic(() => import('@/components/settings/unified/tabs/NotificationsTab'))
const WorkspaceAuditTab    = dynamic(() => import('@/components/settings/unified/tabs/WorkspaceAuditTab'))
const AccountProfileTab    = dynamic(() => import('@/components/settings/unified/tabs/AccountProfileTab'))
const AccountSecurityTab   = dynamic(() => import('@/components/settings/unified/tabs/AccountSecurityTab'))
const AccountDevicesTab    = dynamic(() => import('@/components/settings/unified/tabs/AccountDevicesTab'))

const TAB_COMPONENTS: Record<string, React.ComponentType> = {
  workspace:     WorkspaceGeneralTab,
  members:       WorkspaceMembersTab,
  billing:       WorkspaceBillingTab,
  notifications: NotificationsTab,
  audit:         WorkspaceAuditTab,
  profile:       AccountProfileTab,
  security:      AccountSecurityTab,
  devices:       AccountDevicesTab,
}

export default function GlobalSettingsTabPage() {
  const params = useParams()
  const tab = params.tab as string

  const TabComponent = TAB_COMPONENTS[tab]

  if (!TabComponent) {
    return <p className="text-sm text-neutral-400">Unknown settings tab.</p>
  }

  return <TabComponent />
}
