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
import DashboardShell from '@/components/dashboard/DashboardShell'
import { ErrorBoundary } from '@/components/error-boundary'

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
    id: 'id',
    name: 'ID',
    description: 'Your Ciphera account settings',
    icon: 'https://ciphera.net/id_icon_no_margins.png',
    href: 'https://id.ciphera.net',
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
    // * Skip on /auth/callback — the session JWT may be stale during code
    // * exchange and this fetch would 403 with old credentials.
    if (pathname?.startsWith('/auth/callback')) return
    if (auth.user) {
      getUserOrganizations()
        .then((organizations) => setOrgs(Array.isArray(organizations) ? organizations : []))
        .catch(err => logger.error('Failed to fetch orgs for header', err))
    }
  }, [auth.user, pathname])

  const handleSwitchOrganization = async (orgId: string | null) => {
    if (!orgId) return
    try {
      setIsSwitchingOrg(true)
      const { access_token } = await switchContext(orgId)
      await setSessionAction(access_token)
      // Refresh auth context (re-fetches /auth/user/me with new JWT, updates org_id + SWR cache)
      await auth.refresh()
      router.push('/')
      setTimeout(() => setIsSwitchingOrg(false), 300)
    } catch (err) {
      setIsSwitchingOrg(false)
      logger.error('Failed to switch organization', err)
    }
  }

  const isAuthenticated = !!auth.user
  const showOfflineBar = Boolean(auth.user && !isOnline)
  // Site pages use DashboardShell with full sidebar — no Header needed
  const isSitePage = pathname.startsWith('/sites/') && pathname !== '/sites/new'
  // Pages that use DashboardShell with home sidebar (no site context)
  const isDashboardPage = pathname === '/' || pathname.startsWith('/integrations') || pathname === '/pricing' || pathname.startsWith('/welcome')
  // Checkout page has its own minimal layout — no app header/footer
  const isCheckoutPage = pathname.startsWith('/checkout')
  // Auth callback is a transient route that only renders <LoadingOverlay> while
  // exchanging the OAuth code. The app shell must not mount here — it would
  // fire layout-level data hooks (NotificationCenter polling, sites via
  // UnifiedSettingsModal, organizations) using the stale pre-login session,
  // all of which 403 and create the post-login flicker / slow-load.
  const isAuthCallback = pathname.startsWith('/auth/callback')

  if (isSwitchingOrg) {
    return <LoadingOverlay logoSrc="/pulse_icon_no_margins.png" title="Pulse" portal={false} />
  }

  if (isAuthCallback) {
    return <>{children}</>
  }

  // While auth is loading on a site or checkout page, render nothing to prevent flash of public header
  if (auth.loading && (isSitePage || isCheckoutPage || isDashboardPage)) {
    return null
  }

  // Authenticated site pages: DashboardShell provided by sites layout
  if (isAuthenticated && isSitePage) {
    return (
      <>
        {showOfflineBar && <OfflineBanner isOnline={isOnline} />}
        {children}
        <UnifiedSettingsModal />
      </>
    )
  }

  // Authenticated dashboard pages (home, integrations, pricing): wrap in DashboardShell
  if (isAuthenticated && isDashboardPage) {
    return (
      <>
        {showOfflineBar && <OfflineBanner isOnline={isOnline} />}
        <DashboardShell siteId={null}>{children}</DashboardShell>
        <UnifiedSettingsModal />
      </>
    )
  }

  // Checkout page: render children only (has its own layout)
  if (isAuthenticated && isCheckoutPage) {
    return <>{children}</>
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

  // Session expired on a protected page — only shown when user HAD a session
  // that expired, not for first-time unauthenticated visitors.
  if (!isAuthenticated && !auth.loading && auth.hadPriorSession && (isSitePage || isDashboardPage)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-950">
        <div className="w-full max-w-sm bg-neutral-900 border border-white/[0.08] rounded-2xl p-8 text-center shadow-2xl shadow-black/60"
          style={{ backgroundImage: 'linear-gradient(to bottom, rgba(255,255,255,0.03), transparent 120px)' }}
        >
          <div className="w-14 h-14 rounded-xl bg-red-500/10 flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-white mb-2">Session expired</h2>
          <p className="text-sm text-neutral-400 mb-6">Your session has expired. Please sign in again to continue.</p>
          <button
            onClick={() => window.location.href = '/'}
            className="w-full px-4 py-2.5 bg-brand-orange hover:bg-brand-orange-hover text-white text-sm font-medium rounded-xl transition-colors cursor-pointer"
          >
            Sign in again
          </button>
        </div>
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
      <ErrorBoundary>
        <LayoutInner>{children}</LayoutInner>
      </ErrorBoundary>
    </UnifiedSettingsProvider>
  )
}
