'use client'

import { useCallback } from 'react'
import { useSites } from '@/lib/swr/sites'

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

/** Convert an ISO 3166-1 alpha-2 code to a human-readable country name. */
export function countryName(alpha2: string): string {
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'region' })
    return dn.of(alpha2) ?? alpha2
  } catch {
    return alpha2
  }
}

/** Format a duration in seconds as a short human-readable string (e.g. "2m", "1.5h"). */
export function formatDowntime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  return `${(seconds / 3600).toFixed(1)}h`
}

/** How many whole days remain until the given ISO timestamp (minimum 0). */
export function daysUntil(iso: string): number {
  const diff = new Date(iso).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / (24 * 3600 * 1000)))
}
