import apiRequest from './client'

export interface Visitor {
  session_id: string
  first_seen: string
  last_seen: string
  pageviews: number
  current_path: string
  browser: string
  os: string
  device_type: string
  country: string
  city: string
}

export interface SessionEvent {
  id: string
  site_id: string
  session_id: string
  path: string
  referrer: string | null
  user_agent: string
  country: string | null
  city: string | null
  region: string | null
  device_type: string
  screen_resolution: string | null
  browser: string | null
  os: string | null
  timestamp: string
  created_at: string
}

export async function getRealtimeVisitors(siteId: string): Promise<Visitor[]> {
  const data = await apiRequest<{ visitors: Visitor[] }>(`/sites/${siteId}/realtime/visitors`)
  return data.visitors
}

export async function getSessionDetails(siteId: string, sessionId: string): Promise<SessionEvent[]> {
  const data = await apiRequest<{ events: SessionEvent[] }>(`/sites/${siteId}/sessions/${sessionId}`)
  return data.events
}
