import type { Category } from './types'

/**
 * Category ORDER and fallback vocabulary.
 *
 * 🔴 THE REGISTRY IS THE VOCABULARY (round-3 ruling R3-3: one vocabulary, from
 * the registry; short forms DERIVE from the registry name, never a second
 * list). The wire carries `display_name` on both `category_counts` and the
 * preferences document — render THAT. The labels below exist only as the
 * loading/fallback text before a wire answer exists, and they are transcribed
 * from the registry seed (verified live 31-08-2026), not invented here: the
 * old list ("Site events", "Team activity", "Platform announcements") was the
 * 3-of-6 drift the ruling killed.
 *
 * This list also fixes the FAMILY ORDER (page tabs, settings bands): billing,
 * security, uptime, site, team, system.
 */
export interface NotificationCategory {
  id: Category
  /** Fallback only — prefer the wire's display_name. */
  label: string
  critical: boolean
}

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  { id: 'billing', label: 'Billing', critical: true },
  { id: 'security', label: 'Security', critical: true },
  { id: 'uptime', label: 'Uptime', critical: false },
  { id: 'site', label: 'Site activity', critical: false },
  { id: 'team', label: 'Team', critical: false },
  { id: 'system', label: 'System', critical: false },
]

/**
 * R3-3's shortening, applied to a REGISTRY name (never to a local constant):
 * strip the qualifier words the ruling names. Registry names are already
 * short today ("Uptime", "System"), so this is usually the identity — it
 * exists so a future longer registry name shortens by rule, not by a second
 * list.
 */
export function shortLabel(displayName: string): string {
  return displayName
    .replace(/^Uptime monitoring$/i, 'Uptime')
    .replace(/^Platform announcements$/i, 'Platform')
    .replace(/^Site activity$/i, 'Site activity')
}
