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

export default function ContentHeader({
  onMobileMenuOpen,
}: {
  onMobileMenuOpen: () => void
}) {
  const auth = useAuth()
  const router = useRouter()
  const { openSettings } = useSettingsModal()
  const [orgs, setOrgs] = useState<OrganizationMember[]>([])

  useEffect(() => {
    if (auth.user) {
      getUserOrganizations()
        .then((organizations) => setOrgs(Array.isArray(organizations) ? organizations : []))
        .catch(err => logger.error('Failed to fetch orgs', err))
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
    <div className="shrink-0 flex items-center justify-between border-b border-neutral-200/60 dark:border-neutral-800/60 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl px-4 sm:px-6 py-3.5">
      {/* Left: mobile hamburger */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMobileMenuOpen}
          className="md:hidden p-2 -ml-2 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
          aria-label="Open navigation"
        >
          <MenuIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <AppLauncher apps={CIPHERA_APPS} currentAppId="pulse" />
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
