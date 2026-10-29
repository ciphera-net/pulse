'use client'

import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

/**
 * False on the server and while the page hydrates, true once it is the browser's.
 *
 * The public pages mount for anyone, and the product's pages under them were written for a
 * shell that only ever mounts in the browser after a sign-in: they read storage, the
 * viewport and the URL while rendering. Showing the same static skeleton from the server and
 * for the first client render, and the real tree only after, keeps what the server sent and
 * what the browser draws identical (no hydration mismatch) without server-rendering any of
 * that.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false)
}
