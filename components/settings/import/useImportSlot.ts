'use client'

import useSWR from 'swr'
import { getImportSlot, type SiteImportStatus } from '@/lib/api/dataImports'
import { slotPhase } from './importFormat'

/** M11-e: a pull import's status is polled every five seconds while it moves. */
export const SLOT_POLL_MS = 5_000

export type ImportSlotState =
  | { status: 'loading' }
  | { status: 'error'; error: unknown; retry: () => void }
  | {
      status: 'ready'
      existing: SiteImportStatus | null
      /** Read the slot again from the server. */
      refresh: () => Promise<unknown>
      /**
       * Take a status the server just answered (a finished upload's last batch, a
       * connect, a confirm) without reading the slot again: the app's GET
       * micro-cache could otherwise hand back the pre-change answer for two seconds.
       */
      set: (existing: SiteImportStatus | null) => void
    }

/**
 * The site's one import (any kind), read from the upload window's
 * `existing_import`. `discoverySource` is an upload source the server lists; the
 * route refuses any other.
 *
 * Polled while an import moves without this tab driving it: a pull import the
 * server's worker steps (M11-e), or an upload another tab is sending. An upload
 * THIS tab is sending reports its own progress (`localUpload`), so it is not polled.
 */
export function useImportSlot(
  siteId: string,
  discoverySource: string | null,
  { localUpload }: { localUpload: boolean },
): ImportSlotState {
  const { data, error, mutate } = useSWR(
    discoverySource ? ['importSlot', siteId, discoverySource] : null,
    () => getImportSlot(siteId, discoverySource as string),
    {
      revalidateOnFocus: true,
      shouldRetryOnError: (e: unknown) => {
        const s = (e as { status?: number } | null)?.status
        return s === undefined || s === 0 || s >= 500
      },
      errorRetryCount: 2,
      refreshInterval: (latest) => {
        const existing = latest?.existing_import
        if (!existing || localUpload) return 0
        return slotPhase(existing) === 'active' ? SLOT_POLL_MS : 0
      },
    },
  )
  // No upload source listed: nothing can report the slot, so none is shown. (While
  // DATA_IMPORT_ENABLED is on the server always lists at least one upload source.)
  if (!discoverySource) return { status: 'ready', existing: null, refresh: () => Promise.resolve(), set: () => {} }
  if (error) return { status: 'error', error, retry: () => void mutate() }
  if (!data) return { status: 'loading' }
  return {
    status: 'ready',
    existing: data.existing_import ?? null,
    refresh: () => mutate(),
    set: (existing) => void mutate({ existing_import: existing }, { revalidate: false }),
  }
}
