import { switchContext } from '@/lib/api/organization'
import { setSessionAction } from '@/app/actions/auth'
import { setAccessToken } from '@/lib/api/client'

/**
 * Move this browser's Pulse session to another workspace, WITHOUT navigating.
 *
 * The four steps and their order are the contract (pulse#730, 21-09-2026):
 *
 * 1. `switchContext` mints an access token scoped to the new workspace.
 * 2. `setSessionAction` stores it in Pulse's own cookie — a failure here
 *    means the next page load would come back on the OLD workspace, so it
 *    throws rather than continuing on a session the server never saw.
 * 3. `setAccessToken` primes the in-memory Bearer, which is what pulse-api
 *    actually sees (per-app sessions S3).
 * 4. `refresh()` (AuthProvider's) re-hydrates the user from the new cookie,
 *    then clears EVERY SWR key and refetches the mounted ones under the new
 *    workspace. That IS the cache purge.
 *
 * 🔴 Nothing cache-wide may run after `refresh()` — see lib/swr/org-switch.ts
 * for why a second purge empties the app.
 *
 * Callers decide what happens next. The top bar's switcher goes home; the
 * MCP consent page (/connect, PULSE-41) must NOT leave the page, because the
 * pending connection request lives in its URL and a navigation would strand
 * the assistant that is waiting on it.
 */
export async function switchOrganizationSession(orgId: string, refresh: () => Promise<void>): Promise<void> {
  const { access_token } = await switchContext(orgId)
  const stored = await setSessionAction(access_token)
  if (!stored.success) throw new Error('The switched session could not be stored')
  setAccessToken(access_token)
  await refresh()
}
