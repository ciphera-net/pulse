'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { getUserOrganizations, type OrganizationMember } from '@/lib/api/organization'
import { switchOrganizationSession } from '@/lib/auth/switchOrganization'
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
   * The switch itself (its four ordered steps, pulse#730) lives in
   * `switchOrganizationSession`, shared with the MCP consent page, which must
   * switch WITHOUT leaving. The top bar then goes home.
   *
   * 🔴 Do not add a second cache-wide mutate after the switch: `refresh()`
   * inside it is the purge, and SWR discards a revalidation that started
   * before the key's latest mutation — a second purge threw away every refetch
   * and the app landed on /sites with no sites (lib/swr/org-switch.ts).
   */
  const switchOrganization = useCallback(async (orgId: string | null) => {
    if (!orgId) return
    try {
      await switchOrganizationSession(orgId, auth.refresh)
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
