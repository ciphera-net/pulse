'use client'

import { useCallback } from 'react'
import { useSites } from '@/lib/swr/sites'
import { useMembers } from '@/lib/swr/members'
export { countryName, formatDowntime, daysUntil } from './display-utils'

/**
 * useResolveSiteName — returns a function that maps a site UUID to its display name.
 * If the site has been deleted or is not in the current organisation scope, returns
 * 'Site (deleted)'.
 *
 * Must be called inside a React component tree (uses SWR under the hood).
 * For non-component contexts (e.g. server-side digest renderer) leave resolvers
 * undefined — the renderer falls back to the bare site ID.
 */
export function useResolveSiteName(): (siteId: string) => string {
  const { sites } = useSites()
  return useCallback(
    (siteId: string): string => {
      const site = sites.find(s => s.id === siteId)
      return site?.name ?? site?.domain ?? 'Site (deleted)'
    },
    [sites],
  )
}

/**
 * useResolveUserName — returns a function mapping a user UUID to a display name.
 *
 * Looks up the user in the current organisation's member list (fetched from the
 * id-backend via useMembers / SWR).  Falls back to 'User (removed)' when the
 * user is no longer a member of the organisation.
 */
export function useResolveUserName(): (userId: string) => string {
  const { members } = useMembers()
  return useCallback(
    (userId: string): string => {
      const m = members.find(x => x.user_id === userId)
      return m?.user_email ?? 'User (removed)'
    },
    [members],
  )
}

