'use client'

import { OfflineBanner } from '@/components/OfflineBanner'
import { Footer } from '@/components/Footer'
import { Header, type CipheraApp, MenuIcon } from '@ciphera-net/ui'
import NotificationCenter from '@/components/notifications/NotificationCenter'
import { useAuth } from '@/lib/auth/context'
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { logger } from '@/lib/utils/logger'
import { getUserOrganizations, switchContext, type OrganizationMember } from '@/lib/api/organization'
import { setSessionAction } from '@/app/actions/auth'
import { LoadingOverlay } from '@ciphera-net/ui'
import { useRouter } from 'next/navigation'
import { SettingsModalProvider, useSettingsModal } from '@/lib/settings-modal-context'
import SettingsModalWrapper from '@/components/settings/SettingsModalWrapper'
import { SidebarProvider } from '@/lib/sidebar-context'

const ORG_SWITCH_KEY = 'pulse_switching_org'

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

function LayoutInner({ children }: { children: React.ReactNode }) {
  const auth = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const isOnline = useOnlineStatus()
  const { openSettings } = useSettingsModal()
  const [orgs, setOrgs] = useState<OrganizationMember[]>([])
  const [isSwitchingOrg, setIsSwitchingOrg] = useState(() => {
    if (typeof window === 'undefined') return false
    return sessionStorage.getItem(ORG_SWITCH_KEY) === 'true'
  })

  useEffect(() => {
    if (isSwitchingOrg) {
      sessionStorage.removeItem(ORG_SWITCH_KEY)
      const timer = setTimeout(() => setIsSwitchingOrg(false), 600)
      return () => clearTimeout(timer)
    }
  }, [isSwitchingOrg])

  useEffect(() => {
    if (auth.user) {
      getUserOrganizations()
        .then((organizations) => setOrgs(Array.isArray(organizations) ? organizations : []))
        .catch(err => logger.error('Failed to fetch orgs for header', err))
    }
  }, [auth.user])

  const handleSwitchOrganization = async (orgId: string | null) => {
    if (!orgId) return
    try {
      const { access_token } = await switchContext(orgId)
      await setSessionAction(access_token)
      sessionStorage.setItem(ORG_SWITCH_KEY, 'true')
      window.location.reload()
    } catch (err) {
      logger.error('Failed to switch organization', err)
    }
  }

  const isAuthenticated = !!auth.user
  const showOfflineBar = Boolean(auth.user && !isOnline)
  // Site pages use DashboardShell with full sidebar — no Header needed
  const isSitePage = pathname.startsWith('/sites/') && pathname !== '/sites/new'

  if (isSwitchingOrg) {
    return <LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Pulse" portal={false} />
  }

  // Authenticated site pages: full Dokploy-style layout (sidebar + utility bar)
  // DashboardShell inside children handles everything
  if (isAuthenticated && isSitePage) {
    return (
      <>
        {showOfflineBar && <OfflineBanner isOnline={isOnline} />}
        {children}
        <SettingsModalWrapper />
      </>
    )
  }

  // Authenticated non-site pages (sites list, onboarding, etc.): static header
  if (isAuthenticated) {
    return (
      <div className="flex flex-col min-h-screen">
        {showOfflineBar && <OfflineBanner isOnline={isOnline} />}
        <Header
          auth={auth}
          LinkComponent={Link}
          logoSrc="/pulse_icon_no_margins.png"
          appName="Pulse"
          variant="static"
          orgs={orgs}
          activeOrgId={auth.user?.org_id}
          onSwitchOrganization={handleSwitchOrganization}
          onCreateOrganization={() => router.push('/onboarding')}
          allowPersonalOrganization={false}
          showFaq={false}
          showSecurity={false}
          showPricing={false}
          rightSideActions={<NotificationCenter />}
          apps={CIPHERA_APPS}
          currentAppId="pulse"
          onOpenSettings={openSettings}
        />
        <main className="flex-1 pb-8">
          {children}
        </main>
        <SettingsModalWrapper />
      </div>
    )
  }

  // Public/marketing: floating header + footer
  return (
    <div className="flex flex-col min-h-screen">
      <Header
        auth={auth}
        LinkComponent={Link}
        logoSrc="/pulse_icon_no_margins.png"
        appName="Pulse"
        variant="floating"
        showFaq={false}
        showSecurity={false}
        showPricing={true}
        topOffset={showOfflineBar ? '2.5rem' : undefined}
        apps={CIPHERA_APPS}
        currentAppId="pulse"
        customNavItems={
          <Link
            href="/features"
            className="px-4 py-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white rounded-lg hover:bg-neutral-100/50 dark:hover:bg-neutral-800/50 transition-all duration-200"
          >
            Features
          </Link>
        }
      />
      <main className="flex-1 pb-8 pt-24">
        {children}
      </main>
      <Footer
        LinkComponent={Link}
        appName="Pulse"
        isAuthenticated={false}
      />
      <SettingsModalWrapper />
    </div>
  )
}

export default function LayoutContent({ children }: { children: React.ReactNode }) {
  return (
    <SettingsModalProvider>
      <SidebarProvider>
        <LayoutInner>{children}</LayoutInner>
      </SidebarProvider>
    </SettingsModalProvider>
  )
}
