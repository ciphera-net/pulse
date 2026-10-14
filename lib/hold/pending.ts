'use client'

import { useSyncExternalStore } from 'react'
import type { DeferredAction } from '@ciphera-net/facet-hold'

/**
 * Items a confirmed destructive action has hidden while its Undo window runs
 * (PUL-28). One key per item, `<kind>:<id>` (`site:…`, `member:…`,
 * `api-key:…`). Module-level rather than component state, so a list on
 * another page hides the item too: delete a site from its settings, land on
 * the home list, and the site is not there while its deletion waits.
 *
 * A key is removed again on Undo, on a failed request (the item comes back
 * with an error), and after a successful request once the list has been
 * refreshed (the item is then gone from the data itself; keeping the key
 * would hide a restored site forever).
 */
const pending = new Set<string>()
const EMPTY: ReadonlySet<string> = new Set()
let snapshot: ReadonlySet<string> = EMPTY
const listeners = new Set<() => void>()

function emit() {
  snapshot = new Set(pending)
  listeners.forEach((l) => l())
}

export function hidePending(key: string): void {
  if (pending.has(key)) return
  pending.add(key)
  emit()
}

export function showPending(key: string): void {
  if (pending.delete(key)) emit()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The hidden keys; re-renders when one is added or removed. */
export function usePendingKeys(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, () => snapshot, () => EMPTY)
}

/**
 * Marks `key` as waiting for as long as `action` waits behind the Undo bar,
 * and releases it on Undo, on a failed request, or once `onCommitted` has
 * FINISHED (awaited: a refresh inside it completes first, so a deleted item
 * never flashes back while the list refetches).
 *
 * Two uses, one mechanism: a list hides the item under `key`; a control that
 * starts a non-row action (cancel the subscription, reset data, delete the
 * team) is turned off while `key` is pending, so the same action cannot be
 * confirmed twice. A second confirm would send the first at once (only one
 * action waits at a time) and the Undo on screen would no longer undo it.
 */
export function whilePending(key: string, action: DeferredAction): DeferredAction {
  hidePending(key)
  return {
    ...action,
    onUndo: () => {
      showPending(key)
      action.onUndo?.()
    },
    onCommitted: async (result: unknown) => {
      try {
        await action.onCommitted?.(result)
      } finally {
        showPending(key)
      }
    },
    onError: (error: unknown) => {
      showPending(key)
      action.onError?.(error)
    },
  }
}
