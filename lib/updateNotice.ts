'use client'

/**
 * @file Who tells a person that a new version of Pulse is ready, and whether one is.
 *
 * VersionToast (mounted on every route by app/layout-content.tsx) stays the ONE poller: it runs useVersionCheck and
 * publishes "a new version is ready" here. The What's new button (the whats-new beta, in the dashboard's top bar)
 * reads that and CLAIMS the notice while it is mounted, so the toast steps aside wherever the button can say it
 * instead, and keeps showing everywhere else: /demo, share links, the auth callback, and every team without the beta.
 *
 * Module state behind useSyncExternalStore, not React context: the toast lives outside the dashboard shell that
 * mounts the button (twice, desktop and mobile), so there is no common parent to hold it.
 */

import { useEffect, useSyncExternalStore } from 'react'

let updateReady = false
let claims = 0
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Called by the poller when the deployed build differs from this tab's. It never goes back: only a reload does. */
export function markUpdateReady() {
  if (updateReady) return
  updateReady = true
  emit()
}

/** True once a new version is ready for this tab. */
export function useUpdateReady(): boolean {
  return useSyncExternalStore(subscribe, () => updateReady, () => false)
}

/** The What's new button calls this while mounted: the toast then leaves the notice to it. */
export function useClaimUpdateNotice(active: boolean) {
  useEffect(() => {
    if (!active) return
    claims += 1
    emit()
    return () => {
      claims -= 1
      emit()
    }
  }, [active])
}

/** True while a mounted What's new button has the notice. */
export function useUpdateNoticeClaimed(): boolean {
  return useSyncExternalStore(subscribe, () => claims > 0, () => false)
}

/** Tests only: back to a fresh tab. */
export function resetUpdateNoticeForTests() {
  updateReady = false
  claims = 0
  emit()
}
