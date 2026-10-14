'use client'

import { useCallback } from 'react'
import { toast, getAuthErrorMessage } from '@ciphera-net/facet'
import { useUndo } from '@ciphera-net/facet-hold'
import { hidePending, showPending } from './pending'

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
      hidePending(r.key)
      defer({
        message: r.message,
        commit: r.send,
        onUndo: () => showPending(r.key),
        onCommitted: async () => {
          try {
            await r.refresh?.()
          } finally {
            showPending(r.key)
          }
        },
        onError: (err) => {
          showPending(r.key)
          toast.error(getAuthErrorMessage(err) || r.failure)
        },
      })
    },
    [defer],
  )
}
