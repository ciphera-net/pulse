// * Cleans up stale localStorage entries on app initialization
// * Prevents accumulation from abandoned OAuth flows

export function cleanupStaleStorage() {
  if (typeof window === 'undefined') return

  try {
    // * PKCE keys are only needed during the OAuth callback
    // * If we're not on the callback page, they're stale leftovers
    if (!window.location.pathname.includes('/auth/callback')) {
      localStorage.removeItem('oauth_state')
      localStorage.removeItem('oauth_code_verifier')
    }
  } catch {
    // * Ignore errors (private browsing, storage disabled, etc.)
  }
}
