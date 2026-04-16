import type { Category } from '@/lib/notifications/types'

export interface RetentionDefaults {
  unread_ttl_days: number
  read_ttl_days: number
}

export const RETENTION_DEFAULTS: Record<Category, RetentionDefaults> = {
  billing:  { unread_ttl_days: 90,  read_ttl_days: 30 },
  uptime:   { unread_ttl_days: 14,  read_ttl_days: 7 },
  security: { unread_ttl_days: 180, read_ttl_days: 90 },
  site:     { unread_ttl_days: 60,  read_ttl_days: 14 },
  team:     { unread_ttl_days: 90,  read_ttl_days: 30 },
  system:   { unread_ttl_days: 14,  read_ttl_days: 3 },
}

/** Allowed downward override values (must be ≤ default). Filtered per-category at render time. */
export const OVERRIDE_OPTIONS_DAYS = [3, 7, 14, 30] as const
