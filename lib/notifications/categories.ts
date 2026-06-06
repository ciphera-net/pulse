import type { Category } from './types'

export interface NotificationCategory {
  id: Category
  label: string
  critical: boolean
}

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  { id: 'billing', label: 'Billing', critical: true },
  { id: 'security', label: 'Security', critical: true },
  { id: 'uptime', label: 'Uptime monitoring', critical: false },
  { id: 'site', label: 'Site events', critical: false },
  { id: 'team', label: 'Team activity', critical: false },
  { id: 'system', label: 'Platform announcements', critical: false },
]
