/**
 * The single definition of "an authenticated app route" — a route whose content
 * is the app shell and must NEVER render marketing chrome.
 *
 * 🔴 The 25-08 incident's chrome half: a dead session on a site page fell
 * through to MarketingHeader stacked over the dashboard, because the takeover
 * hinged on a fragile in-memory flag instead of the route. The route IS the
 * durable signal: what a URL is for does not change when a session dies.
 *
 * Public dashboard-shell routes (/pricing, /integrations/*, /installation) are
 * deliberately NOT app routes — they server-render a marketing variant for
 * crawlers and anonymous visitors by design.
 * Audit: Infra/Auth/docs/audits/25-08-2026-lost-rotation-reuse-revocation-and-half-state-chrome.md §3, §5.2
 */
export function isAuthedAppRoute(pathname: string): boolean {
  if (pathname.startsWith('/sites/') && pathname !== '/sites/new') return true
  return (
    pathname === '/sites' ||
    pathname === '/sites/new' ||
    pathname === '/notifications' ||
    pathname.startsWith('/settings')
  )
}
