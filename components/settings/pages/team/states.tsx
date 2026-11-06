'use client'

import { useCallback } from 'react'
import { Button, toast } from '@ciphera-net/facet'
import { useUndo } from '@ciphera-net/facet-hold'
import { WarningCircle } from '@phosphor-icons/react'
import { KitRow } from '@/components/settings/kit/Kit'
import { whilePending } from '@/lib/hold/pending'

/** A section's rows while its read is in flight: hairline rows of grey bars, in the kit's row geometry. */
export function KitLoadingRows({ rows = 1 }: { rows?: number }) {
  return (
    <div role="status" aria-busy="true" aria-label="Loading" className="animate-skeleton-fade divide-y divide-border">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="grid grid-cols-1 gap-x-6 gap-y-2 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="space-y-2">
            <div className="h-3.5 w-32 bg-input" />
            <div className="h-3 w-56 max-w-full bg-input" />
          </div>
          <div className="h-8 w-24 bg-input" />
        </div>
      ))}
    </div>
  )
}

/**
 * A read that failed, as a row: what failed in the label, a coral state icon (R32), and Try again on the row's right
 * edge. Never an empty list: a failure must not read as "nothing here".
 */
export function KitLoadError({ title, onRetry, retrying = false }: { title: string; onRetry: () => void; retrying?: boolean }) {
  return (
    <div role="alert">
      <KitRow
        label={title}
        icon={<WarningCircle weight="fill" />}
        state
        tone="coral"
        control={
          <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
            Try again
          </Button>
        }
      />
    </div>
  )
}

export interface TeamRemoval {
  /** The item it hides at once: `<kind>:<id>`, the key lists filter on. */
  key: string
  /** The Undo bar's words, in the past tense. */
  message: string
  /** Sends the request; pass `keepalive` straight through to the API call. */
  send: (options: { keepalive: boolean }) => Promise<unknown>
  /** After the request succeeded: re-read, so the item is gone from the data before it is shown again. */
  refresh: () => unknown
  /** The page's own words when the request failed and the item comes back. */
  failure: string
}

/**
 * Hide an item now and send its removal when the 6-second Undo runs out (PUL-28), as `useDeferredRemoval` does, but
 * a failure always shows the page's own words: Facet's `getAuthErrorMessage` never returns an empty string, so a
 * `getAuthErrorMessage(err) || failure` fallback never shows (copy deck §9.11.1).
 */
export function useTeamRemoval() {
  const { defer } = useUndo()
  return useCallback(
    (r: TeamRemoval) => {
      defer(
        whilePending(r.key, {
          message: r.message,
          commit: r.send,
          onCommitted: () => r.refresh(),
          onError: () => {
            toast.error(r.failure)
          },
        }),
      )
    },
    [defer],
  )
}
