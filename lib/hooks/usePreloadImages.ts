'use client'

import { useEffect } from 'react'
import { preloadImages } from '@/lib/utils/preloadImages'

/**
 * Keeps the given pictures loaded and decoded while the caller is mounted (see lib/utils/preloadImages.ts).
 *
 * Give it every address the caller may show NEXT, not only what is on screen: the page after the current one, the
 * other tabs' first rows, a panel that has not opened yet. Empty entries are skipped, so a caller can map rows
 * straight to their icon address.
 *
 * `when` holds the request back (a picture nobody may ever look at should wait for an idle moment).
 */
export function usePreloadImages(urls: readonly (string | null | undefined)[], when = true): void {
  // One string as the dependency: the list is rebuilt on every render, its content rarely changes.
  const key = urls.filter(Boolean).join('\n')
  useEffect(() => {
    if (!when || !key) return
    preloadImages(key.split('\n'))
  }, [key, when])
}
