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
// * Notification preferences are per person and live under Account
// * (/settings/account/notifications). The workspace tab that pointed there
// * was retired 21-09-2026 (ruling D7) — there was no workspace-level setting
// * behind it.
const WorkspaceAuditTab   = dynamic(() => import('@/components/settings/unified/tabs/WorkspaceAuditTab'))
const WorkspaceApiKeysTab = dynamic(() => import('@/components/settings/unified/tabs/WorkspaceApiKeysTab'))
const WorkspaceConnectedAppsTab = dynamic(() => import('@/components/settings/unified/tabs/WorkspaceConnectedAppsTab'))

const TAB_COMPONENTS: Record<string, React.ComponentType> = {
  general:       WorkspaceGeneralTab,
  members:       WorkspaceMembersTab,
  roles:         WorkspaceRolesTab,
  billing:       WorkspaceBillingTab,
  audit:         WorkspaceAuditTab,
  'api-keys':    WorkspaceApiKeysTab,
  'connected-apps': WorkspaceConnectedAppsTab,
}

const TAB_PERMISSIONS: Record<string, Permission> = {
  roles:         'roles.manage',
  billing:       'billing.view',
  audit:         'audit.view',
  // * Issuing a credential for an external system is the same class of action as
  // * connecting one, so it reuses the integrations permission.
  'api-keys':    'integrations.manage',
  // * Connecting an assistant is the same class of action as issuing a key
  // * (MCP design D4), and the server gates both routes on it.
  'connected-apps': 'integrations.manage',
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
