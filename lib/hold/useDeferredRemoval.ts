'use client'

import { useCallback } from 'react'
import { toast } from '@ciphera-net/facet'
import { useUndo } from '@ciphera-net/facet-hold'
import { whilePending } from './pending'

export interface DeferredRemoval {
  /** The item it hides at once: `<kind>:<id>`, the key lists filter on. */
  key: string
  /** What the Undo bar says, in the past tense: "Member removed". */
  message: string
  /**
   * Sends the request. 🔴 Pass `keepalive` straight through to the API call:
   * when the page is being hidden or left it must reach fetch() in this tick
   * (see `apiRequest`'s team-gate note).
   */
  send: (options: { keepalive: boolean }) => Promise<unknown>
  /** After the request succeeded: refetch, so the item is gone from the data. */
  refresh?: () => unknown
  /** Shown when the request failed and the item comes back. */
  failure: string
}

/**
 * Hide an item now, send its delete when the Undo window runs out (PUL-28).
 * Undo puts it back and sends nothing; a failed request puts it back and says
 * so. Lists filter on `usePendingKeys()`.
 */
export function useDeferredRemoval() {
  const { defer } = useUndo()
  return useCallback(
    (r: DeferredRemoval) => {
      defer(
        whilePending(r.key, {
          message: r.message,
          commit: r.send,
          // Awaited by whilePending before the item is shown again: the
          // refetch must land first, or the deleted item flashes back.
          onCommitted: () => r.refresh?.(),
          // The caller's own words, always: Facet's getAuthErrorMessage returns a sentence of its own for every
          // error, so `getAuthErrorMessage(err) || r.failure` never showed `failure` (a refusal read "Invalid
          // credentials"; settings overhaul, carried findings).
          onError: () => {
            toast.error(r.failure)
          },
        }),
      )
    },
    [defer],
  )
}
