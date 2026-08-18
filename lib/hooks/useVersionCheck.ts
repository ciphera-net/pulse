'use client'

import { useEffect, useRef, useCallback } from 'react'
import { isChunkLoadError, isChunkLoadFailure, recoverFromChunkFailure } from '@/lib/chunk-recovery'

const POLL_INTERVAL = 5 * 60 * 1000
const CLIENT_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev'

export function useVersionCheck(onNewVersion: () => void) {
  const notifiedRef = useRef(false)

  const notify = useCallback(() => {
    if (notifiedRef.current) return
    notifiedRef.current = true
    onNewVersion()
  }, [onNewVersion])

  // * Recover a dead click by reloading once to pick up the current build. A toast
  // * alone is not enough: a failed import means this tab's JS can no longer complete
  // * navigations, so to the user the page is simply unresponsive (measured
  // * 18-08-2026 — sidebar clicks did nothing after a deploy). When the guard blocks
  // * the reload (see lib/chunk-recovery.ts) fall back to the visible toast.
  const recover = useCallback(() => {
    if (recoverFromChunkFailure()) return
    // A guard-blocked chunk failure means THIS tab is actively broken right now —
    // always (re-)show the toast, bypassing the once-per-mount latch the poll uses.
    // A user who dismissed an ordinary update toast earlier must still be warned.
    notifiedRef.current = true
    onNewVersion()
  }, [onNewVersion])

  // Poll /build-id.json every 5 minutes — and immediately when the tab regains
  // visibility, because a backgrounded tab is exactly the one that comes back stale.
  useEffect(() => {
    if (CLIENT_BUILD_ID === 'dev') return

    async function check() {
      try {
        const res = await fetch(`/build-id.json?_=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (data.buildId && data.buildId !== CLIENT_BUILD_ID) {
          notify()
        }
      } catch {}
    }

    function onVisible() {
      if (document.visibilityState === 'visible') check()
    }

    const id = setInterval(check, POLL_INTERVAL)
    // First check after 60 seconds (give the app time to settle)
    const initialTimeout = setTimeout(check, 60_000)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(id)
      clearTimeout(initialTimeout)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [notify])

  // Secondary channels for chunk failures React never sees. 🔑 The PRIMARY path —
  // a failed route import during App Router navigation — is caught by React and
  // delivered to the error boundaries (app/error.tsx), NOT here; measured 18-08-2026,
  // see lib/chunk-recovery.ts. These listeners cover dynamic import() from event
  // handlers ('unhandledrejection') and uncaught chunk errors ('error').
  useEffect(() => {
    function onError(event: ErrorEvent) {
      if (isChunkLoadFailure(event.message || '')) recover()
    }
    function onRejection(event: PromiseRejectionEvent) {
      if (isChunkLoadError(event.reason)) recover()
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [recover])
}
