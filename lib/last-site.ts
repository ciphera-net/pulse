/**
 * @file Last-visited site memory. Visiting any site page records the site id
 * (localStorage, survives sessions); entering the app at "/" hard-redirects
 * to that site ONCE per browser session. Both site pages and the home page
 * mark the session as "entered", so deep links into a site and in-app
 * navigation back to "Your Sites" render normally instead of bouncing —
 * without the once-per-session guard the nav link would redirect straight
 * back and the sites list would be unreachable.
 */

const LAST_SITE_KEY = 'pulse_last_site_id'
const ENTERED_KEY = 'pulse_session_entered'

export function rememberLastSite(siteId: string): void {
  if (typeof window === 'undefined' || !siteId) return
  try {
    localStorage.setItem(LAST_SITE_KEY, siteId)
  } catch {
    /* storage unavailable (private mode) — feature degrades to no-op */
  }
}

export function getLastSiteId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(LAST_SITE_KEY)
  } catch {
    return null
  }
}

/**
 * Marks this browser session as having landed in the app. Returns true if it
 * already had (= any redirect decision is spent), false on the first call.
 */
export function markSessionEntered(): boolean {
  if (typeof window === 'undefined') return true
  try {
    if (sessionStorage.getItem(ENTERED_KEY) === 'true') return true
    sessionStorage.setItem(ENTERED_KEY, 'true')
    return false
  } catch {
    return true
  }
}

/**
 * The site id to hard-redirect to on app entry, or null. Pure — validates the
 * remembered id against the sites the user can currently access, so deleted
 * sites or revoked access fall back to the list.
 */
export function entryRedirectTarget(
  lastSiteId: string | null,
  accessibleSiteIds: string[],
  sessionAlreadyEntered: boolean
): string | null {
  if (sessionAlreadyEntered || !lastSiteId) return null
  return accessibleSiteIds.includes(lastSiteId) ? lastSiteId : null
}
