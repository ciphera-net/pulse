import apiRequest from './client'
import type { eventWithTime } from '@rrweb/types'

export interface ReplayListItem {
  id: string
  session_id: string
  started_at: string
  ended_at: string | null
  duration_ms: number
  events_count: number
  device_type: string | null
  browser: string | null
  os: string | null
  country: string | null
  entry_page: string
  is_skeleton_mode: boolean
}

export interface ReplayFilters {
  device_type?: string
  country?: string
  min_duration?: number
  limit?: number
  offset?: number
}

export interface ReplayListResponse {
  replays: ReplayListItem[]
  total: number
  limit: number
  offset: number
}

export interface SessionReplay extends ReplayListItem {
  site_id: string
  consent_given: boolean
  created_at: string
  expires_at: string
}

export async function listReplays(
  siteId: string,
  filters?: ReplayFilters
): Promise<ReplayListResponse> {
  const params = new URLSearchParams()
  if (filters?.device_type) params.set('device_type', filters.device_type)
  if (filters?.country) params.set('country', filters.country)
  if (filters?.min_duration) params.set('min_duration', filters.min_duration.toString())
  if (filters?.limit) params.set('limit', filters.limit.toString())
  if (filters?.offset) params.set('offset', filters.offset.toString())

  const queryString = params.toString()
  const url = `/sites/${siteId}/replays${queryString ? `?${queryString}` : ''}`

  return apiRequest<ReplayListResponse>(url)
}

export async function getReplay(siteId: string, replayId: string): Promise<SessionReplay> {
  return apiRequest<SessionReplay>(`/sites/${siteId}/replays/${replayId}`)
}

export async function getReplayData(siteId: string, replayId: string): Promise<eventWithTime[]> {
  const response = await apiRequest<eventWithTime[]>(`/sites/${siteId}/replays/${replayId}/data`)
  return response
}

export async function deleteReplay(siteId: string, replayId: string): Promise<void> {
  await apiRequest(`/sites/${siteId}/replays/${replayId}`, {
    method: 'DELETE',
  })
}

// Utility function to format replay duration
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}

// Utility function to get device icon
export function getDeviceIcon(deviceType: string | null): string {
  switch (deviceType?.toLowerCase()) {
    case 'mobile':
      return '📱'
    case 'tablet':
      return '📱'
    case 'desktop':
    default:
      return '💻'
  }
}

// Utility function to get browser icon
export function getBrowserIcon(browser: string | null): string {
  switch (browser?.toLowerCase()) {
    case 'chrome':
      return '🌐'
    case 'firefox':
      return '🦊'
    case 'safari':
      return '🧭'
    case 'edge':
      return '🌀'
    default:
      return '🌐'
  }
}
