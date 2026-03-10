// * SSE hook for real-time visitor streaming.
// * Replaces 5-second polling with a persistent EventSource connection.
// * The backend broadcasts one DB query per site to all connected clients,
// * so 1,000 users on the same site share a single query instead of each
// * triggering their own.

import { useEffect, useRef, useState, useCallback } from 'react'
import { API_URL } from '@/lib/api/client'
import type { Visitor } from '@/lib/api/realtime'

interface UseRealtimeSSEReturn {
  visitors: Visitor[]
  connected: boolean
}

export function useRealtimeSSE(siteId: string): UseRealtimeSSEReturn {
  const [visitors, setVisitors] = useState<Visitor[]>([])
  const [connected, setConnected] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  // Stable callback so we don't recreate EventSource on every render
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data)
      setVisitors(data.visitors || [])
    } catch {
      // Ignore malformed messages
    }
  }, [])

  useEffect(() => {
    if (!siteId) return

    const url = `${API_URL}/api/v1/sites/${siteId}/realtime/stream`
    const es = new EventSource(url, { withCredentials: true })
    esRef.current = es

    es.onopen = () => setConnected(true)
    es.onmessage = handleMessage
    es.onerror = () => {
      setConnected(false)
      // EventSource auto-reconnects with exponential backoff
    }

    return () => {
      es.close()
      esRef.current = null
      setConnected(false)
    }
  }, [siteId, handleMessage])

  return { visitors, connected }
}
