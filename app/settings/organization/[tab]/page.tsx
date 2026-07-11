'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useCan, type Permission } from '@/lib/auth/permissions'
import { ShieldWarning } from '@phosphor-icons/react'

const WorkspaceGeneralTab = dynamic(() => import('@/components/settings/unified/tabs/WorkspaceGeneralTab'))
const WorkspaceMembersTab = dynamic(() => import('@/components/settings/unified/tabs/WorkspaceMembersTab'))
const WorkspaceRolesTab   = dynamic(() => import('@/components/settings/unified/tabs/WorkspaceRolesTab'))
const WorkspaceBillingTab = dynamic(() => import('@/components/settings/unified/tabs/WorkspaceBillingTab'))
const NotificationsTab    = dynamic(() => import('@/components/settings/unified/tabs/NotificationsTab'))
const WorkspaceAuditTab   = dynamic(() => import('@/components/settings/unified/tabs/WorkspaceAuditTab'))

const TAB_COMPONENTS: Record<string, React.ComponentType> = {
  general:       WorkspaceGeneralTab,
  members:       WorkspaceMembersTab,
  roles:         WorkspaceRolesTab,
  billing:       WorkspaceBillingTab,
  notifications: NotificationsTab,
  audit:         WorkspaceAuditTab,
}

const TAB_PERMISSIONS: Record<string, Permission> = {
  members: 'team.view',
  roles:   'roles.manage',
  billing: 'billing.view',
  audit:   'audit.view',
}

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <ShieldWarning className="w-12 h-12 text-neutral-600 mb-4" />
      <h3 className="text-base font-semibold text-neutral-300 mb-1">Access restricted</h3>
      <p className="text-sm text-neutral-500 max-w-sm">You don&apos;t have permission to view this page. Contact your workspace owner to request access.</p>
    </div>
  )
}

export default function OrganizationSettingsTabPage() {
  const params = useParams()
  const router = useRouter()
  const tab = params.tab as string

  const requiredPerm = TAB_PERMISSIONS[tab]
  const hasAccess = useCan(requiredPerm as Permission)

  const TabComponent = TAB_COMPONENTS[tab]

  // * Unknown tabs redirect to the section default instead of dead-ending
  // * on a raw fallback string.
  useEffect(() => {
    if (!TabComponent) router.replace('/settings/organization/general')
  }, [TabComponent, router])

  if (!TabComponent) {
    return null
  }

  if (requiredPerm && !hasAccess) {
    return <AccessDenied />
  }

  return <TabComponent />
}
