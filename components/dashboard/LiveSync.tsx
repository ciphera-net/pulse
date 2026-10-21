'use client'

import { useEffect, useRef } from 'react'
import { useRealtimeSync } from '@/lib/hooks/useRealtimeSync'
import { PUBLIC_LIVE_POLL_MS } from '@/lib/dashboard/realtimeRange'

// ---------------------------------------------------------------------------
// The two ways a dashboard in realtime mode learns that there is something new.
// Each renders nothing and is mounted only while the page is live; the page hands
// both the SAME `onChanged`, so what a refresh does (refetch the fan-out and every live
// list) is written once and the transport is the only difference.
//
//  - SocketLiveSync: a member's page. The realtime socket (lib/hooks/useRealtimeSync)
//    says "something changed" and the page refetches over HTTP.
//  - PollLiveSync: a public page (the demo). The stream is a ticketed, member-only
//    connection, so a public view never opens one: it refreshes on a timer instead.
//
// They are components, not a flag on one hook, so that in a public view the socket
// hook is never called at all.
// ---------------------------------------------------------------------------

export function SocketLiveSync({ siteId, onChanged }: { siteId: string; onChanged: () => void }) {
  useRealtimeSync({ enabled: true, siteId, onChanged })
  return null
}

export function PollLiveSync({ onChanged, intervalMs = PUBLIC_LIVE_POLL_MS }: { onChanged: () => void; intervalMs?: number }) {
  // The latest callback, read when the timer fires: a new function identity on every
  // render of the page must not restart the timer and push the next refresh back.
  const changedRef = useRef(onChanged)
  useEffect(() => {
    changedRef.current = onChanged
  }, [onChanged])

  useEffect(() => {
    const id = setInterval(() => {
      // A hidden tab has nobody to show it to: skip the tick; the next visible one catches up.
      if (document.visibilityState === 'hidden') return
      changedRef.current()
    }, intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return null
}
