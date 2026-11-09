'use client'

import { useCallback } from 'react'
import useSWR from 'swr'
import { useAuth } from '@/lib/auth/context'
import { getWhatsNew, markWhatsNewSeen, type WhatsNewResponse } from '@/lib/api/whatsNew'

/**
 * What's new for the signed-in person. Keyed by person: the posts are the same for everyone and the seen set (and so
 * every unread mark) is the person's own. The two mounts of the button (desktop and mobile) share one fetch.
 */
export function useWhatsNew() {
  const { user } = useAuth()
  const keyId = user ? user.id : null
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
