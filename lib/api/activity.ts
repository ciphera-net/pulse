import apiRequest from './client'

export interface AuditLogEntry {
  id: string
  created_at: string
  event_type: string
  outcome: string
  ip_address?: string
  user_agent?: string
  metadata?: Record<string, string>
}

export interface ActivityResponse {
  entries: AuditLogEntry[] | null
  total_count: number
  has_more: boolean
  limit: number
  offset: number
}

export async function getUserActivity(
  limit = 20,
  offset = 0
): Promise<ActivityResponse> {
  return apiRequest<ActivityResponse>(
    `/auth/user/activity?limit=${limit}&offset=${offset}`
  )
}
