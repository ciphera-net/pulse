'use client'

import { useEffect, useRef, useCallback } from 'react'

const POLL_INTERVAL = 5 * 60 * 1000
const CLIENT_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev'

export function useVersionCheck(onNewVersion: () => void) {
  const notifiedRef = useRef(false)

  const notify = useCallback(() => {
    if (notifiedRef.current) return
    notifiedRef.current = true
    onNewVersion()
  }, [onNewVersion])

  // Poll /api/version every 5 minutes
  useEffect(() => {
    if (CLIENT_BUILD_ID === 'dev') return

    async function check() {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (data.buildId && data.buildId !== CLIENT_BUILD_ID) {
          notify()
        }
      } catch {}
    }

    const id = setInterval(check, POLL_INTERVAL)
    // First check after 60 seconds (give the app time to settle)
    const initialTimeout = setTimeout(check, 60_000)

    return () => {
      clearInterval(id)
      clearTimeout(initialTimeout)
    }
  }, [notify])

  // Catch chunk load errors (fallback for immediate detection)
  useEffect(() => {
    function handler(event: ErrorEvent) {
      const msg = event.message || ''
      if (
        msg.includes('ChunkLoadError') ||
        msg.includes('Loading chunk') ||
        msg.includes('Failed to fetch dynamically imported module')
      ) {
        notify()
      }
    }

    window.addEventListener('error', handler)
    return () => window.removeEventListener('error', handler)
  }, [notify])
}
