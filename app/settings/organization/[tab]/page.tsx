'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useCan, type Permission } from '@/lib/auth/permissions'
import { ShieldWarning } from '@phosphor-icons/react'
import { useTeamState } from '@/lib/hooks/useTeamState'

// The team's three pages of the settings overhaul (PUL-42), each on today's route. Emails already sent link to billing
// and api-keys, so those routes never change.
const TeamPage = dynamic(() => import('@/components/settings/pages/team/TeamPage'))
const BillingPage = dynamic(() => import('@/components/settings/pages/billing/BillingPage'))
const DevelopersPage = dynamic(() => import('@/components/settings/pages/developers/DevelopersPage'))

const TAB_COMPONENTS: Record<string, React.ComponentType> = {
  members: TeamPage,
  billing: BillingPage,
  'api-keys': DevelopersPage,
}

/**
 * Routes a page took in, and old slugs: each lands on its page. Team holds the team's name, roles (R1: fixed, no page
 * of their own), beta features and the activity log; Developers holds the AI assistants ("connected-apps" became
 * "mcp" on 24-09-2026).
 */
const TAB_REDIRECTS: Record<string, string> = {
  general: 'members',
  roles: 'members',
  beta: 'members',
  audit: 'members',
  mcp: 'api-keys',
  'connected-apps': 'api-keys',
}

// Billing gates at the route; Team and Developers say who they are for in their own words.
const TAB_PERMISSIONS: Record<string, Permission> = {
  billing: 'billing.view',
}

function AccessDenied() {
  // Somebody alone owns their account, so there is nobody to ask (PULSE-59).
  const alone = useTeamState() === 'alone'
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <ShieldWarning className="mb-4 h-12 w-12 text-neutral-600" />
      <h3 className="mb-1 text-base font-semibold text-neutral-300">Owners and admins only</h3>
      <p className="max-w-sm text-sm text-neutral-500">
        {alone ? 'This page is not available on your account.' : 'Ask the owner of your team to open it for you.'}
      </p>
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

  useEffect(() => {
    const target = TAB_REDIRECTS[tab]
    if (target) router.replace(`/settings/organization/${target}${window.location.search}`)
    else if (!TabComponent) router.replace('/settings/organization/members')
  }, [TabComponent, router, tab])

  if (!TabComponent) return null
  if (requiredPerm && !hasAccess) return <AccessDenied />
  return <TabComponent />
}
