'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { getUserOrganizations, switchContext, type OrganizationMember } from '@/lib/api/organization'
import { setSessionAction } from '@/app/actions/auth'
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

  const switchOrganization = useCallback(async (orgId: string | null) => {
    if (!orgId) return
    try {
      const { access_token } = await switchContext(orgId)
      await setSessionAction(access_token)
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
