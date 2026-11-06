'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'

// Your two pages of the settings overhaul (PUL-42): Account (profile, sign-in and security, recovery, devices, security
// activity) and Notifications (every email switch, R41), each on today's route.
const AccountPage = dynamic(() => import('@/components/settings/pages/account/AccountPage'))
const NotificationsPage = dynamic(() => import('@/components/settings/pages/notifications/NotificationsPage'))

const TAB_COMPONENTS: Record<string, React.ComponentType> = {
  profile: AccountPage,
  notifications: NotificationsPage,
}

/**
 * Routes a page took in, and old slugs: each lands on its page. "security-alerts" folded into Notifications on
 * 16-10-2026 (OPS-17); security and devices are sections of Account.
 */
const TAB_REDIRECTS: Record<string, string> = {
  security: 'profile',
  devices: 'profile',
  'security-alerts': 'notifications',
}

export default function AccountSettingsTabPage() {
  const params = useParams()
  const router = useRouter()
  const tab = params.tab as string
  const TabComponent = TAB_COMPONENTS[tab]

  useEffect(() => {
    const target = TAB_REDIRECTS[tab]
    if (target) router.replace(`/settings/account/${target}${window.location.search}`)
    else if (!TabComponent) router.replace('/settings/account/profile')
  }, [TabComponent, router, tab])

  if (!TabComponent) return null
  return <TabComponent />
}
