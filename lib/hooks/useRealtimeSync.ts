'use client'

import { useEffect, useRef } from 'react'
import { API_URL } from '@/lib/api/client'
import apiRequest from '@/lib/api/client'

/**
 * useRealtimeSync — THE transport seam for realtime mode.
 *
 * Everything above this hook is transport-agnostic: the mode state, the orb, the
 * chart and every block only know that `onChanged` fires when there is something
 * new. If the transport ever has to change, this file changes and nothing else
 * does.
 *
 * WHAT TRAVELS. A single message, `{"t":"changed"}`, and never any data. The
 * page refetches over HTTP and reads the same endpoints every other period
 * reads, so there is one source of truth for the numbers on screen and a lost
 * message costs freshness rather than correctness.
 *
 * 🔴 WHY A TICKET. A browser cannot set an Authorization header on a WebSocket
 * handshake — `new WebSocket(url)` takes a URL and nothing else — and since
 * per-app sessions the dashboard's credential is an in-memory Bearer token for a
 * different host, not a cookie. So the page spends that token on an ordinary
 * authenticated POST for a 60-second, single-use, site-scoped ticket and
 * presents it on the stream URL. Every connect mints a fresh one; a ticket is
 * burned server-side on first use, so a reconnect cannot replay the last one.
 *
 * DEGRADES, NEVER GOES DARK. If the socket cannot be established — the stream
 * hostname is unset, the network refuses the upgrade, the backoff is still
 * waiting — the hook falls back to polling `onChanged` on a timer. The dashboard
 * keeps updating; it just updates on a cadence instead of on an event. That
 * matters here because the stream deliberately runs on a direct hostname that
 * bypasses the CDN, which inherits the cluster's known intermittent
 * connection failures on node churn.
 */

/** Poll cadence used when the socket is unavailable. Matches the server's own 5s live cache. */
const FALLBACK_POLL_MS = 5_000

/** Reconnect backoff: quick at first, then backs off; capped so a long outage still recovers. */
const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000]

/** Coalesce bursts on the client too — the server debounces, but a reconnect can deliver late. */
const MIN_CHANGED_INTERVAL_MS = 800

function streamBase(): string | null {
  const raw = (process.env.NEXT_PUBLIC_REALTIME_WS_URL || '').trim()
  if (raw) return raw.replace(/\/+$/, '')
  // Derive from the API host when no dedicated stream host is configured. This is
  // the LOCAL-DEV path; production sets the variable to the direct hostname that
  // bypasses the CDN, because a CDN edge has never been proven to relay a
  // WebSocket upgrade in this estate.
  if (!API_URL) return null
  try {
    const u = new URL(API_URL)
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
    return u.toString().replace(/\/+$/, '')
  } catch {
    return null
  }
}

export interface RealtimeSyncOptions {
  /** Live mode is only wired while this is true; false tears the socket down. */
  enabled: boolean
  siteId: string
  /** Called when the server says there is something new, already debounced. */
  onChanged: () => void
}

export function useRealtimeSync({ enabled, siteId, onChanged }: RealtimeSyncOptions): void {
  // Keep the callback in a ref so a new function identity on every render does
  // not tear down and re-open the socket — that would reconnect on each parent
  // render and burn a ticket every time.
  const changedRef = useRef(onChanged)
  changedRef.current = onChanged

  useEffect(() => {
    if (!enabled || !siteId) return

    let cancelled = false
    let socket: WebSocket | null = null
    let pollTimer: ReturnType<typeof setInterval> | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let attempt = 0
    let lastChangedAt = 0

    const fire = () => {
      const now = Date.now()
      if (now - lastChangedAt < MIN_CHANGED_INTERVAL_MS) return
      lastChangedAt = now
      changedRef.current()
    }

    const startFallbackPolling = () => {
      if (pollTimer || cancelled) return
      pollTimer = setInterval(fire, FALLBACK_POLL_MS)
    }
    const stopFallbackPolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
    }

    const scheduleReconnect = () => {
      if (cancelled) return
      // Poll while we are disconnected, so a failing socket never means a frozen
      // dashboard. The poll is cleared the moment a socket opens.
      startFallbackPolling()
      const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]
      attempt += 1
      retryTimer = setTimeout(connect, delay)
    }

    const connect = async () => {
      if (cancelled) return
      const base = streamBase()
      if (!base) {
        // No stream host configured: polling is the whole transport.
        startFallbackPolling()
        return
      }
      try {
        const { ticket } = await apiRequest<{ ticket: string; expires_in: number }>(
          `/api/v1/sites/${siteId}/realtime/ticket`,
          { method: 'POST' },
        )
        if (cancelled || !ticket) return

        const url = `${base}/api/v1/sites/${siteId}/realtime/stream?ticket=${encodeURIComponent(ticket)}`
        const ws = new WebSocket(url)
        socket = ws

        ws.onopen = () => {
          if (cancelled) {
            ws.close()
            return
          }
          attempt = 0
          // The socket is live, so the timer is redundant. Keeping both would
          // double every refetch.
          stopFallbackPolling()
        }
        ws.onmessage = () => fire()
        ws.onerror = () => {
          // onclose always follows; reconnecting here too would double-schedule.
        }
        ws.onclose = () => {
          if (cancelled) return
          socket = null
          scheduleReconnect()
        }
      } catch {
        if (!cancelled) scheduleReconnect()
      }
    }

    // Do not hold a connection for a tab nobody is looking at. The socket is
    // cheap but not free, and a backgrounded tab that refetches on every event
    // spends the viewer's battery and our rate limit for a screen nobody sees.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (!socket) {
          attempt = 0
          void connect()
        }
        // Catch up immediately on return, rather than waiting for the next event.
        fire()
      } else {
        stopFallbackPolling()
        if (socket) {
          const s = socket
          socket = null
          s.close()
        }
        if (retryTimer) {
          clearTimeout(retryTimer)
          retryTimer = null
        }
      }
    }

    if (document.visibilityState === 'visible') void connect()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      stopFallbackPolling()
      if (retryTimer) clearTimeout(retryTimer)
      if (socket) {
        const s = socket
        socket = null
        s.close()
      }
    }
  }, [enabled, siteId])
}
