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

/**
 * Pages that own their whole viewport: no dashboard shell, no marketing chrome.
 * The setup wizard, the workspace switch, an invite link, and the MCP consent
 * page (/connect, PULSE-41), which a person reaches from an AI assistant and
 * which must look like one decision, not like the marketing site around it.
 */
export function isStandaloneRoute(pathname: string): boolean {
  return (
    pathname.startsWith('/setup') ||
    pathname.startsWith('/switch') ||
    pathname.startsWith('/join') ||
    pathname.startsWith('/connect')
  )
}

/**
 * Routes the onboarding wall never redirects away from. The wall sends an
 * owner of an unfinished workspace into the setup wizard; these are the pages
 * where that would destroy what the person came to do:
 *   - /setup is the wizard itself, /settings is the way out of it;
 *   - /join: someone deciding whether to accept a colleague's invite;
 *   - /connect: someone connecting an assistant. The natural first touch for
 *     an MCP user is a brand-new account with an empty workspace — exactly the
 *     population the wall exists to catch — and the wizard has no way back to
 *     the pending request the assistant is waiting on (m3-frontend survey §6).
 */
export function isExemptFromOnboardingWall(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return (
    pathname.startsWith('/setup') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/join') ||
    pathname.startsWith('/connect')
  )
}

/**
 * Routes where the app-wide wall must NOT hand a signed-in person with no
 * workspace a default one in the background. Each of these decides the
 * workspace question itself:
 *   - /setup is where a workspace is created by hand;
 *   - /join: someone about to belong to somebody else's workspace must not be
 *     handed a stray one first (the rule `shouldProvisionWorkspace` keeps for
 *     the sign-in callback);
 *   - /connect (PULSE-41) provisions the workspace ITSELF, in the open, before
 *     it shows the consent (first-time users → (a), owner 24-09-2026). Left to
 *     the wall, the page read "no workspace" once, rendered the dead end, and
 *     never noticed the workspace the wall created a moment later (M3 frontend
 *     review, 24-09-2026).
 */
export function isExemptFromWorkspaceProvisioning(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return pathname.startsWith('/setup') || pathname.startsWith('/join') || pathname.startsWith('/connect')
}
