'use client'

import { MotionConfig } from 'framer-motion'
import { OfflineBanner } from '@/components/OfflineBanner'
import { Footer } from '@/components/Footer'
import { Header as MarketingHeader } from '@/components/marketing/Header'
import { useAuth } from '@/lib/auth/context'
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import DashboardShell from '@/components/dashboard/DashboardShell'
import { ErrorBoundary } from '@/components/error-boundary'
import VersionToast from '@/components/VersionToast'
import { useEffect } from 'react'
import { reportClientEvent } from '@/lib/utils/clientEvents'

function LayoutInner({ children }: { children: React.ReactNode }) {
  const auth = useAuth()
  const pathname = usePathname()
  const isOnline = useOnlineStatus()

  const isAuthenticated = !!auth.user
  const showOfflineBar = Boolean(auth.user && !isOnline)
  // Site pages use DashboardShell with full sidebar — no Header needed
  const isSitePage = pathname.startsWith('/sites/') && pathname !== '/sites/new'
  // Pages that use DashboardShell with home sidebar (no site context). `/sites`
  // is the authenticated home (public `/` server-renders marketing and
  // redirects signed-in visitors here via middleware).
  const isDashboardPage = pathname === '/sites' || pathname.startsWith('/integrations') || pathname === '/pricing' || pathname === '/installation' || pathname === '/notifications' || pathname === '/sites/new' || pathname.startsWith('/settings') || pathname.startsWith('/admin')
  // Public dashboard-shell routes (/pricing, /integrations/*) must SERVER-RENDER
  // their marketing variant for crawlers, so they are excluded from the
  // "hold a blank frame while the auth probe runs" guard below. Anonymous
  // visitors get the marketing shell server-side; a signed-in visitor briefly
  // sees it on a hard load before the client swaps to DashboardShell (a
  // client-side navigation, where auth is already resolved, never flashes).
  const isPublicDashboardPage = pathname === '/pricing' || pathname.startsWith('/integrations') || pathname === '/installation'
  // Checkout page has its own minimal layout — no app header/footer
  const isCheckoutPage = pathname.startsWith('/checkout')
  // Auth callback is a transient route that only renders <LoadingOverlay> while
  // exchanging the OAuth code. The app shell must not mount here — it would
  // fire layout-level data hooks (NotificationCenter polling, sites via
  // UnifiedSettingsModal, organizations) using the stale pre-login session,
  // all of which 403 and create the post-login flicker / slow-load.
  const isAuthCallback = pathname.startsWith('/auth/callback')

  // * TELEMETRY, not a fix: count every render where an APP route is about to
  // * fall through to marketing chrome because the session is gone and
  // * hadPriorSession doesn't cover it — the exact franken-state the 25-08
  // * customer screenshotted (marketing header over live dashboard chrome).
  // * The chrome fix itself is a separate, design-approved change; this makes
  // * the fallthrough measurable in Loki either way.
  // * Audit: 25-08-2026-lost-rotation-reuse-revocation-and-half-state-chrome.md §3, §5.5
  const isAppRoute = (pathname.startsWith('/sites/') && pathname !== '/sites/new') ||
    pathname === '/sites' || pathname === '/notifications' ||
    pathname.startsWith('/settings') || pathname.startsWith('/admin')
  const willFallThroughToMarketing =
    !auth.user && !auth.loading && !auth.hadPriorSession && isAppRoute
  useEffect(() => {
    if (willFallThroughToMarketing) {
      reportClientEvent('marketing_fallthrough_on_app_route')
    }
  }, [willFallThroughToMarketing])

  if (isAuthCallback) {
    return <>{children}</>
  }

  // While auth is loading on an authed-only chrome page, render nothing to
  // prevent a flash of the public header. Public dashboard-shell routes are
  // excluded so they server-render marketing for crawlers.
  if (auth.loading && (isSitePage || isCheckoutPage || (isDashboardPage && !isPublicDashboardPage))) {
    return null
  }

  // Authenticated site pages: DashboardShell provided by sites layout
  if (isAuthenticated && isSitePage) {
    return (
      <>
        {showOfflineBar && <OfflineBanner isOnline={isOnline} />}
        {children}
      </>
    )
  }

  // Authenticated dashboard pages (home, integrations, pricing): wrap in DashboardShell
  if (isAuthenticated && isDashboardPage) {
    return (
      <>
        {showOfflineBar && <OfflineBanner isOnline={isOnline} />}
        <DashboardShell siteId={null}>{children}</DashboardShell>
      </>
    )
  }

  // Checkout page: render children only (has its own layout)
  if (isAuthenticated && isCheckoutPage) {
    return <>{children}</>
  }

  // Setup wizard: own layout with stepper — no app shell
  if (isAuthenticated && (pathname.startsWith('/setup') || pathname.startsWith('/switch') || pathname.startsWith('/join'))) {
    return <>{children}</>
  }

  // Signed-in visitors on any remaining route (marketing pages: /about, /faq,
  // /features, the /vs cluster, guides, tools, …) get the same marketing chrome
  // as anonymous visitors — the legacy pre-Facet app Header that used to render
  // here was removed 07-08-2026 (it dropped the whole app frame and predated
  // the marketing overhaul; app surfaces belong to the DashboardShell lists
  // above).

  // Session expired on a protected page — only shown when user HAD a session
  // that expired, not for first-time unauthenticated visitors.
  if (!isAuthenticated && !auth.loading && auth.hadPriorSession && (isSitePage || isDashboardPage)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-950">
        <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-none p-8 text-center"
          style={{ backgroundImage: 'linear-gradient(to bottom, rgba(255,255,255,0.03), transparent 120px)' }}
        >
          <div className="w-14 h-14 rounded-none bg-red-500/10 flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-white mb-2">Session expired</h2>
          <p className="text-sm text-neutral-400 mb-6">Your session has expired. Please sign in again to continue.</p>
          <button
            onClick={() => window.location.href = '/'}
            className="w-full px-4 py-2.5 bg-brand-orange hover:bg-brand-orange-hover text-white text-sm font-medium rounded-none transition-colors cursor-pointer"
          >
            Sign in again
          </button>
        </div>
      </div>
    )
  }

  // Join page: standalone, no app shell
  if (pathname.startsWith('/join')) {
    return <>{children}</>
  }

  // Public/marketing: sticky header + footer, all on the bordered rail.
  // The rail container (max-w-6xl + sm:border-x) is identical on the header,
  // this main, and the footer, so the two vertical lines run continuously top
  // to bottom. Sections/pages render inside it and supply their own px-6;
  // full-bleed border-b sections span the rail width. No horizontal padding
  // here so section hairlines reach the rail edges.
  return (
    <div className="flex flex-col min-h-screen">
      <MarketingHeader />
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 sm:border-x sm:border-border"
      >
        {children}
      </main>
      <Footer LinkComponent={Link} />
    </div>
  )
}

export default function LayoutContent({ children }: { children: React.ReactNode }) {
  return (
    // One app-wide honour of `prefers-reduced-motion` — every framer-motion
    // consumer (settings bottom-sheet, accordions, notification panel, …) drops
    // transform/opacity animation to an instant cut when the OS asks for it.
    <MotionConfig reducedMotion="user">
      <ErrorBoundary>
        <VersionToast />
        <LayoutInner>{children}</LayoutInner>
      </ErrorBoundary>
    </MotionConfig>
  )
}
