import apiRequest from './client'

export interface ReportSchedule {
  id: string
  site_id: string
  organization_id: string
  channel: 'email' | 'slack' | 'discord' | 'webhook'
  channel_config: EmailConfig | WebhookConfig
  frequency: 'daily' | 'weekly' | 'monthly'
  timezone: string
  enabled: boolean
  report_type: 'summary' | 'pages' | 'sources' | 'goals'
  last_sent_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

export interface EmailConfig {
  recipients: string[]
}

export interface WebhookConfig {
  url: string
}

export interface CreateReportScheduleRequest {
  channel: string
  channel_config: EmailConfig | WebhookConfig
  frequency: string
  timezone?: string
  report_type?: string
}

export interface UpdateReportScheduleRequest {
  channel?: string
  channel_config?: EmailConfig | WebhookConfig
  frequency?: string
  timezone?: string
  report_type?: string
  enabled?: boolean
}

export async function listReportSchedules(siteId: string): Promise<ReportSchedule[]> {
  const res = await apiRequest<{ report_schedules: ReportSchedule[] }>(`/sites/${siteId}/report-schedules`)
  return res?.report_schedules ?? []
}

export async function createReportSchedule(siteId: string, data: CreateReportScheduleRequest): Promise<ReportSchedule> {
  return apiRequest<ReportSchedule>(`/sites/${siteId}/report-schedules`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateReportSchedule(siteId: string, scheduleId: string, data: UpdateReportScheduleRequest): Promise<ReportSchedule> {
  return apiRequest<ReportSchedule>(`/sites/${siteId}/report-schedules/${scheduleId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteReportSchedule(siteId: string, scheduleId: string): Promise<void> {
  await apiRequest(`/sites/${siteId}/report-schedules/${scheduleId}`, {
    method: 'DELETE',
  })
}

export async function testReportSchedule(siteId: string, scheduleId: string): Promise<void> {
  await apiRequest(`/sites/${siteId}/report-schedules/${scheduleId}/test`, {
    method: 'POST',
  })
}
