import apiRequest from '@/lib/api/client'

export type DeliveryMode = 'in_app_only' | 'email_immediate' | 'email_digest' | 'off'

export interface Preferences {
  user_id: string
  delivery_modes: Record<string, DeliveryMode>
  quiet_hours_start: string | null
  quiet_hours_end: string | null
  timezone: string
  digest_time: string
  retention_overrides: Record<string, { read_ttl_days: number }>
  updated_at: string
}

export const getPrefs = () => apiRequest<Preferences>('/notifications/preferences')

export const updatePrefs = (p: Partial<Preferences>) =>
  apiRequest<{ ok: boolean }>('/notifications/preferences', {
    method: 'PUT',
    body: JSON.stringify(p),
    headers: { 'Content-Type': 'application/json' },
  })
