'use client'

import { useCallback } from 'react'
import { useSites } from '@/lib/swr/sites'
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
 * Currently a stub — returns 'A team member' for every user ID.
 * TODO(7.x): integrate with the organization members API once a members context
 * or hook is available (the /organizations/:id/members endpoint exists but there
 * is no global client-side members cache yet).
 */
export function useResolveUserName(): (userId: string) => string {
  return useCallback((_userId: string): string => {
    // TODO(7.x): replace with real members lookup
    return 'A team member'
  }, [])
}

