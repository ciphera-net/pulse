'use client'

import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'

const WorkspaceGeneralTab = dynamic(() => import('@/components/settings/unified/tabs/WorkspaceGeneralTab'))
const WorkspaceMembersTab = dynamic(() => import('@/components/settings/unified/tabs/WorkspaceMembersTab'))
const WorkspaceBillingTab = dynamic(() => import('@/components/settings/unified/tabs/WorkspaceBillingTab'))
const NotificationsTab    = dynamic(() => import('@/components/settings/unified/tabs/NotificationsTab'))
const WorkspaceAuditTab   = dynamic(() => import('@/components/settings/unified/tabs/WorkspaceAuditTab'))

const TAB_COMPONENTS: Record<string, React.ComponentType> = {
  general:       WorkspaceGeneralTab,
  members:       WorkspaceMembersTab,
  billing:       WorkspaceBillingTab,
  notifications: NotificationsTab,
  audit:         WorkspaceAuditTab,
}

export default function OrganizationSettingsTabPage() {
  const params = useParams()
  const tab = params.tab as string

  const TabComponent = TAB_COMPONENTS[tab]

  if (!TabComponent) {
    return <p className="text-sm text-neutral-400">Unknown settings tab.</p>
  }

  return <TabComponent />
}
