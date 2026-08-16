// * Cleans up stale localStorage entries on app initialization
// * Prevents accumulation from abandoned OAuth flows

import { prunePendingAuth } from '@/lib/api/oauth-store'

/**
 * Collect abandoned OAuth attempts.
 *
 * Expiry is by AGE only (see `PENDING_MAX_AGE_MS`) — never by route. This used
 * to delete the in-flight PKCE keys on any path that wasn't `/auth/callback`,
 * which meant a person who touched any other Pulse page mid-sign-in arrived at
 * the callback with no stored state. The callback read that as "not a full
 * OAuth flow", skipped state validation, and exchanged the code anyway: the
 * validation failed open, silently, depending on where the user had clicked.
 */
export function cleanupStaleStorage() {
  if (typeof window === 'undefined') return

  prunePendingAuth()
}
