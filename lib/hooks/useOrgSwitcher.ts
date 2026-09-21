'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { getUserOrganizations, switchContext, type OrganizationMember } from '@/lib/api/organization'
import { setSessionAction } from '@/app/actions/auth'
import { setAccessToken } from '@/lib/api/client'
import { logger } from '@/lib/utils/logger'

/**
 * The org list + workspace switch/create handlers a UserMenu instance needs.
 *
 * Lifted out of GlassTopBar so the mobile top bar (ContentHeader) can pass the
 * same four props. The Facet UserMenu renders its workspace section only when
 * `orgs` is non-empty AND `onSwitchOrganization` is set — the mobile instance
 * passed neither, so a multi-org customer on a phone had no way to switch or
 * create a workspace at all, while the identical desktop menu offered both.
 *
 * Both top bars are mounted simultaneously (hidden by breakpoint, not by
 * mount), so this hook runs twice; the API client's in-flight dedupe collapses
 * the two GET /organizations calls into one request.
 */
export function useOrgSwitcher() {
  const auth = useAuth()
  const router = useRouter()
  const [orgs, setOrgs] = useState<OrganizationMember[]>([])

  useEffect(() => {
    if (auth.user) {
      getUserOrganizations()
        .then((organizations) => setOrgs(Array.isArray(organizations) ? organizations : []))
        .catch(err => logger.error('Failed to fetch orgs', err))
    }
  }, [auth.user])

  /**
   * The order below is the contract (pulse#730, 21-09-2026):
   *
   * 1. `switchContext` mints an access token scoped to the new org.
   * 2. `setSessionAction` stores it in Pulse's own cookie — a failure here
   *    means the next page load would come back on the OLD org, so it stops
   *    the switch rather than continuing on a session the server never saw.
   * 3. `setAccessToken` primes the in-memory Bearer, which is what pulse-api
   *    actually sees (per-app sessions S3): the cookie alone changes nothing
   *    about what the next request sends. `refresh()` re-primes it from the
   *    cookie too; doing it here makes the order explicit instead of a side
   *    effect of a server round trip.
   * 4. `refresh()` re-hydrates the user from the new cookie, then clears EVERY
   *    SWR key and refetches the mounted ones under the new org. That IS the
   *    cache purge for this path.
   *
   * 🔴 Do not add a second cache-wide mutate after `refresh()`. SWR discards a
   * revalidation that started before the key's latest mutation, so the
   * `clearOrgScopedCaches()` that used to follow it threw away every refetch
   * `refresh()` had just started, left the dedupe entries behind to swallow
   * anything that mounted in the next 30 s, and the app landed on /sites with
   * no sites until the PWA was closed and reopened. lib/swr/org-switch.ts
   * carries the rule; the setup wizard's org step is the path that uses it.
   */
  const switchOrganization = useCallback(async (orgId: string | null) => {
    if (!orgId) return
    try {
      const { access_token } = await switchContext(orgId)
      const stored = await setSessionAction(access_token)
      if (!stored.success) throw new Error('The switched session could not be stored')
      setAccessToken(access_token)
      await auth.refresh()
      router.push('/')
    } catch (err) {
      logger.error('Failed to switch organization', err)
    }
  }, [auth, router])

  const createOrganization = useCallback(() => {
    router.push('/setup/org?new=1')
  }, [router])

  return {
    orgs,
    activeOrgId: auth.user?.org_id ?? null,
    switchOrganization,
    createOrganization,
  }
}
