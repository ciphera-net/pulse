'use client'

import { useCallback } from 'react'
import { toast } from '@ciphera-net/facet'
import { useUndo } from '@ciphera-net/facet-hold'
import { whilePending } from '@/lib/hold/pending'

export interface Removal {
  /** The item it hides at once: `<kind>:<id>`, the key the lists filter on. */
  key: string
  /** What the Undo bar says, in the past tense. */
  message: string
  /** Sends the request; pass `keepalive` straight through to the API call. */
  send: (options: { keepalive: boolean }) => Promise<unknown>
  /** After the request succeeded: refetch, so the item is gone from the data. */
  refresh: () => unknown
  /** Shown when the request failed and the item comes back. */
  failure: string
}

/**
 * Hide an item now and send its removal when the 6-second Undo runs out, as `lib/hold/useDeferredRemoval` does, with
 * one difference: a failed request shows `failure`, the page's own words. That hook shows
 * `getAuthErrorMessage(err) || failure`, and Facet's helper always returns a sentence of its own, so the failure words
 * never appeared (a refused request read "Invalid credentials"; settings overhaul plan §3, carried findings).
 */
export function useRemoveLater() {
  const { defer } = useUndo()
  return useCallback(
    (r: Removal) => {
      defer(
        whilePending(r.key, {
          message: r.message,
          commit: r.send,
          // Awaited before the item may show again, so the refetch lands first and the removed item never flashes back.
          onCommitted: async () => {
            await r.refresh()
          },
          onError: () => {
            toast.error(r.failure)
          },
        }),
      )
    },
    [defer],
  )
}
