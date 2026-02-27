'use client'

import { OfflineBanner } from '@/components/OfflineBanner'
import { Footer } from '@/components/Footer'
import { Header, type CipheraApp } from '@ciphera-net/ui'
import NotificationCenter from '@/components/notifications/NotificationCenter'
import { useAuth } from '@/lib/auth/context'
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { logger } from '@/lib/utils/logger'
import { getUserOrganizations, switchContext } from '@/lib/api/organization'
import { setSessionAction } from '@/app/actions/auth'
import { LoadingOverlay } from '@ciphera-net/ui'
import { useRouter } from 'next/navigation'

const ORG_SWITCH_KEY = 'pulse_switching_org'

// * Available Ciphera apps for the app switcher
const CIPHERA_APPS: CipheraApp[] = [
  {
    id: 'pulse',
    name: 'Pulse',
    description: 'Your current app — Privacy-first analytics',
    icon: '/pulse_icon_no_margins.png',
    href: 'https://pulse.ciphera.net',
    isAvailable: false, // * Current app
  },
  {
    id: 'drop',
    name: 'Drop',
    description: 'Secure file sharing',
    icon: '/drop_icon_no_margins.png',
    href: 'https://drop.ciphera.net',
    isAvailable: true,
  },
  {
    id: 'auth',
    name: 'Ciphera Account',
    description: 'Manage your account settings',
    icon: '/auth_icon_no_margins.png',
    href: 'https://auth.ciphera.net',
    isAvailable: true,
  },
]

export default function LayoutContent({ children }: { children: React.ReactNode }) {
  const auth = useAuth()
  const router = useRouter()
  const isOnline = useOnlineStatus()
  const [orgs, setOrgs] = useState<any[]>([])
  const [isSwitchingOrg, setIsSwitchingOrg] = useState(() => {
    if (typeof window === 'undefined') return false
    return sessionStorage.getItem(ORG_SWITCH_KEY) === 'true'
  })

  // * Clear the switching flag once the page has settled after reload
  useEffect(() => {
    if (isSwitchingOrg) {
      sessionStorage.removeItem(ORG_SWITCH_KEY)
      const timer = setTimeout(() => setIsSwitchingOrg(false), 600)
      return () => clearTimeout(timer)
    }
  }, [isSwitchingOrg])

  // * Fetch organizations for the header organization switcher
  useEffect(() => {
    if (auth.user) {
      getUserOrganizations()
        .then((organizations) => setOrgs(Array.isArray(organizations) ? organizations : []))
        .catch(err => logger.error('Failed to fetch orgs for header', err))
    }
  }, [auth.user])

  const handleSwitchOrganization = async (orgId: string | null) => {
    if (!orgId) return // Pulse doesn't support personal organization context
    try {
      const { access_token } = await switchContext(orgId)
      await setSessionAction(access_token)
      sessionStorage.setItem(ORG_SWITCH_KEY, 'true')
      window.location.reload()
    } catch (err) {
      logger.error('Failed to switch organization', err)
    }
  }

  const handleCreateOrganization = () => {
    router.push('/onboarding')
  }
  
  const showOfflineBar = Boolean(auth.user && !isOnline);
  const barHeightRem = 2.5;
  const headerHeightRem = 6;
  const mainTopPaddingRem = barHeightRem + headerHeightRem;

  if (isSwitchingOrg) {
    return <LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Pulse" portal={false} />
  }

  return (
    <>
      {auth.user && <OfflineBanner isOnline={isOnline} />}
      <Header 
        auth={auth} 
        LinkComponent={Link} 
        logoSrc="/pulse_icon_no_margins.png"
        appName="Pulse"
        orgs={orgs}
        activeOrgId={auth.user?.org_id}
        onSwitchOrganization={handleSwitchOrganization}
        onCreateOrganization={handleCreateOrganization}
        allowPersonalOrganization={false}
        showFaq={false}
        showSecurity={false}
        showPricing={true}
        topOffset={showOfflineBar ? `${barHeightRem}rem` : undefined}
        rightSideActions={auth.user ? <NotificationCenter /> : null}
        apps={CIPHERA_APPS}
        currentAppId="pulse"
        customNavItems={
          <>
            {!auth.user && (
              <Link
                href="/features"
                className="px-4 py-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white rounded-lg hover:bg-neutral-100/50 dark:hover:bg-neutral-800/50 transition-all duration-200"
              >
                Features
              </Link>
            )}
          </>
        }
      />
      <main
        className={`flex-1 pb-8 ${showOfflineBar ? '' : 'pt-24'}`}
        style={showOfflineBar ? { paddingTop: `${mainTopPaddingRem}rem` } : undefined}
      >
        {children}
      </main>
      <Footer 
        LinkComponent={Link}
        appName="Pulse"
        isAuthenticated={!!auth.user}
      />
    </>
  )
}
