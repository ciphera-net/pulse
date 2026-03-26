'use client'

import { OfflineBanner } from '@/components/OfflineBanner'
import { Footer } from '@/components/Footer'
import { Header, type CipheraApp } from '@ciphera-net/ui'
import { Header as MarketingHeader } from '@/components/marketing/Header'
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
import { UnifiedSettingsProvider, useUnifiedSettings } from '@/lib/unified-settings-context'
import UnifiedSettingsModal from '@/components/settings/unified/UnifiedSettingsModal'

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
  const { openUnifiedSettings } = useUnifiedSettings()
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

  // While auth is loading on a site page, render nothing to prevent flash of public header
  if (auth.loading && isSitePage) {
    return null
  }

  // Authenticated site pages: full sidebar layout
  // DashboardShell inside children handles everything
  if (isAuthenticated && isSitePage) {
    return (
      <>
        {showOfflineBar && <OfflineBanner isOnline={isOnline} />}
        {children}
        <UnifiedSettingsModal />
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
          onOpenSettings={() => openUnifiedSettings({ context: 'account', tab: 'profile' })}
        />
        <main className="flex-1 pb-8">
          {children}
        </main>
        <UnifiedSettingsModal />
      </div>
    )
  }

  // Public/marketing: sticky header + footer
  return (
    <div className="flex flex-col min-h-screen">
      <MarketingHeader />
      <main className="flex-1 pb-8">
        {children}
      </main>
      <Footer
        LinkComponent={Link}
        appName="Pulse"
        isAuthenticated={false}
      />
    </div>
  )
}

export default function LayoutContent({ children }: { children: React.ReactNode }) {
  return (
    <UnifiedSettingsProvider>
      <LayoutInner>{children}</LayoutInner>
    </UnifiedSettingsProvider>
  )
}
