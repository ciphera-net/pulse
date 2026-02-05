/**
 * Audit log API client (org-scoped; requires org admin role)
 */

import apiRequest from './client'

export interface AuditLogEntry {
  id: string
  org_id: string
  actor_id?: string
  actor_email?: string
  action: string
  resource_type: string
  occurred_at: string
  payload?: Record<string, unknown>
}

export interface GetAuditLogParams {
  limit?: number
  offset?: number
  action?: string
  log_id?: string
  start_date?: string
  end_date?: string
}

export interface GetAuditLogResponse {
  entries: AuditLogEntry[]
  total: number
}

export async function getAuditLog(params: GetAuditLogParams = {}): Promise<GetAuditLogResponse> {
  const search = new URLSearchParams()
  if (params.limit != null) search.set('limit', String(params.limit))
  if (params.offset != null) search.set('offset', String(params.offset))
  if (params.action) search.set('action', params.action)
  if (params.log_id) search.set('log_id', params.log_id)
  if (params.start_date) search.set('start_date', params.start_date)
  if (params.end_date) search.set('end_date', params.end_date)
  const qs = search.toString()
  const url = qs ? `/api/audit?${qs}` : '/api/audit'
  const data = await apiRequest<GetAuditLogResponse>(url, { method: 'GET' })
  return {
    entries: Array.isArray(data?.entries) ? data.entries : [],
    total: typeof data?.total === 'number' ? data.total : 0,
  }
}
