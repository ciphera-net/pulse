'use client'

import { useCallback } from 'react'
import useSWR from 'swr'
import { useAuth } from '@/lib/auth/context'
import { getWhatsNew, markWhatsNewSeen, type WhatsNewResponse } from '@/lib/api/whatsNew'

/**
 * What's new for the signed-in person in the active team. Keyed by person AND team: the beta is evaluated per team,
 * the seen set belongs to the person. The two mounts of the button (desktop and mobile) share one fetch.
 *
 * Pass enabled = (useFeature('whats-new') === true): nothing is fetched otherwise, so a team without the beta never
 * asks the route, which answers the router's 404 for it.
 */
export function useWhatsNew(enabled: boolean) {
  const { user } = useAuth()
  const keyId = enabled && user ? `${user.id}|${user.org_id}` : null
  const { data, error, isLoading, mutate } = useSWR<WhatsNewResponse>(keyId ? ['whats-new', keyId] : null, () => getWhatsNew(), {
    revalidateOnFocus: false,
    dedupingInterval: 300_000,
  })

  /** Records the posts in the feed now as seen, then caches the server's answer (nothing unread). */
  const markSeen = useCallback(async () => {
    if (!keyId) return
    try {
      const fresh = await markWhatsNewSeen()
      await mutate(fresh, { revalidate: false })
    } catch (err) {
      // Not swallowed: the dot simply stays until the next open, and the console says why.
      console.error("What's new: could not record what was seen", err)
    }
  }, [keyId, mutate])

  return { data, error, isLoading, reload: () => mutate(), markSeen }
}
