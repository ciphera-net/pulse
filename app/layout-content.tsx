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
import SessionTakeover from '@/components/auth/SessionTakeover'
import { isAuthedAppRoute } from '@/lib/auth/appRoutes'

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
  const isDashboardPage = pathname === '/sites' || pathname.startsWith('/integrations') || pathname === '/pricing' || pathname === '/installation' || pathname === '/notifications' || pathname === '/sites/new' || pathname.startsWith('/settings')
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

  // * The chrome hinge, made route-derived (the D takeover, approved
  // * 26-08-2026). An app route with no session renders exactly ONE thing —
  // * the takeover — regardless of any in-memory flag. The old hinge was
  // * `hadPriorSession`, which a cross-tab logout cleared and a cache wipe
  // * destroyed, and every uncovered state fell through to MarketingHeader
  // * stacked over the app shell: the franken-state a customer screenshotted.
  // * Audit: 25-08-2026-lost-rotation-reuse-revocation-and-half-state-chrome.md §3, §5.2
  const isAppRoute = isAuthedAppRoute(pathname)

  if (isAuthCallback) {
    return <>{children}</>
  }

  // * Session being actively restored (transient-failure retry loop) on an app
  // * route: give the wait a face instead of a blank frame.
  if (isAppRoute && auth.loading && auth.recovering) {
    return <SessionTakeover state="restoring" />
  }

  // * Dead session on an app route → the takeover, always. First-time visitors
  // * deep-linking an app URL get the same room with sign-in-to-continue copy
  // * (the pulse_had_session cookie tells the two apart inside the component).
  if (isAppRoute && !isAuthenticated && !auth.loading) {
    return <SessionTakeover state="signed-out" />
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

  // * The pre-26-08 "Session expired" card lived here, hinged on
  // * auth.hadPriorSession. Superseded by the SessionTakeover early-return
  // * above, which covers every dead-session state on app routes — including
  // * the ones the flag never did.

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
