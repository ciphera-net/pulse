'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ThemeToggle, AppLauncher, UserMenu, type CipheraApp, MenuIcon } from '@ciphera-net/ui'
import { useAuth } from '@/lib/auth/context'
import { useSettingsModal } from '@/lib/settings-modal-context'
import { getUserOrganizations, switchContext, type OrganizationMember } from '@/lib/api/organization'
import { setSessionAction } from '@/app/actions/auth'
import { logger } from '@/lib/utils/logger'
import { useSidebar } from '@/lib/sidebar-context'
import NotificationCenter from '@/components/notifications/NotificationCenter'

const CIPHERA_APPS: CipheraApp[] = [
  {
    id: 'pulse',
    name: 'Pulse',
    description: 'Your current app — Privacy-first analytics',
    icon: 'https://ciphera.net/pulse_icon_no_margins.png',
    href: 'https://pulse.ciphera.net',
    isAvailable: false,
  },
  {
    id: 'drop',
    name: 'Drop',
    description: 'Secure file sharing',
    icon: 'https://ciphera.net/drop_icon_no_margins.png',
    href: 'https://drop.ciphera.net',
    isAvailable: true,
  },
  {
    id: 'auth',
    name: 'Auth',
    description: 'Your Ciphera account settings',
    icon: 'https://ciphera.net/auth_icon_no_margins.png',
    href: 'https://auth.ciphera.net',
    isAvailable: true,
  },
]

export default function UtilityBar() {
  const auth = useAuth()
  const router = useRouter()
  const { openSettings } = useSettingsModal()
  const { openMobile } = useSidebar()
  const [orgs, setOrgs] = useState<OrganizationMember[]>([])

  useEffect(() => {
    if (auth.user) {
      getUserOrganizations()
        .then((organizations) => setOrgs(Array.isArray(organizations) ? organizations : []))
        .catch(err => logger.error('Failed to fetch orgs for utility bar', err))
    }
  }, [auth.user])

  const handleSwitchOrganization = async (orgId: string | null) => {
    if (!orgId) return
    try {
      const { access_token } = await switchContext(orgId)
      await setSessionAction(access_token)
      sessionStorage.setItem('pulse_switching_org', 'true')
      window.location.reload()
    } catch (err) {
      logger.error('Failed to switch organization', err)
    }
  }

  return (
    <div className="shrink-0 flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 sm:px-8 py-3.5">
      {/* Left: Pulse logo + mobile toggle */}
      <div className="flex items-center gap-3">
        <button
          onClick={openMobile}
          className="lg:hidden p-2 -ml-2 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
          aria-label="Open navigation"
        >
          <MenuIcon className="w-5 h-5" />
        </button>
        <Link
          href="/"
          className="flex items-center gap-3 group relative"
        >
          <div className="relative w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center shrink-0">
            <img
              src="/pulse_icon_no_margins.png"
              alt="Pulse Logo"
              className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300 transform-gpu will-change-transform [backface-visibility:hidden]"
            />
          </div>
          <span className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white tracking-tight group-hover:text-brand-orange transition-colors duration-300">
            Pulse
          </span>
        </Link>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <AppLauncher
          apps={CIPHERA_APPS}
          currentAppId="pulse"
        />
        <NotificationCenter />
        <UserMenu
          auth={auth}
          LinkComponent={Link}
          orgs={orgs}
          activeOrgId={auth.user?.org_id}
          onSwitchOrganization={handleSwitchOrganization}
          onCreateOrganization={() => router.push('/onboarding')}
          allowPersonalOrganization={false}
          onOpenSettings={openSettings}
        />
      </div>
    </div>
  )
}
