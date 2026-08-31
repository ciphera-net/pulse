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

// ── The §7.2 document (S10) ─────────────────────────────────────────────────
//
// The family UI's data source: iris's preferences document rides the same GET
// verbatim beside the legacy enum keys above. Category metadata (display
// names, criticality, suppressible) and the registry retention block come
// from the wire — never from a client-side table (the retention-policy.ts
// copy this replaced was the third drift-prone copy of the TTL table).

export interface CategoryPreferenceDoc {
  category_id: string
  display_name: string
  criticality: 'critical' | 'standard' | 'low'
  suppressible: boolean
  digest_group: string | null
  unread_ttl_seconds: number
  read_ttl_seconds: number
  min_retention_seconds: number
  default_in_app: boolean
  default_email: boolean
  default_digest: boolean
  /** Effective values: the stored row when one exists, else the defaults. */
  in_app: boolean
  email: boolean
  digest: boolean
  muted: boolean
  /** True when the user chose this; false when it is the registry default. */
  stored: boolean
  retention_override_seconds: number | null
}

export interface RecipientPreferencesDoc {
  timezone: string | null
  quiet_hours_start: string | null
  quiet_hours_end: string | null
  quiet_hours_mode: 'defer' | 'drop'
  digest_time: string
}

/** The GET response: legacy enum keys (Preferences) + the §7.2 document. */
export interface PreferencesDocument extends Preferences {
  product: string
  recipient_preferences: RecipientPreferencesDoc
  categories: CategoryPreferenceDoc[]
}

/** One category's write, the §13b boolean shape. Omitted fields keep stored. */
export interface CategoryWrite {
  in_app?: boolean
  email?: boolean
  digest?: boolean
  muted?: boolean
  retention_override_seconds?: number | null
}

export const getPrefsDocument = () =>
  apiRequest<PreferencesDocument>('/notifications/preferences')

/**
 * The §13b boolean PUT. ⚠️ The proxy sends the recipient_preferences block on
 * EVERY write, so quiet hours / digest time / timezone must ALWAYS be included
 * — a categories-only body would silently reset the schedule to defaults.
 * Callers hold the full document and pass its schedule fields through.
 */
export interface BooleanPrefsWrite {
  timezone?: string
  quiet_hours_start?: string | null
  quiet_hours_end?: string | null
  digest_time?: string
  categories?: Record<string, CategoryWrite>
}

export const updatePrefsBooleans = (w: BooleanPrefsWrite) =>
  apiRequest<PreferencesDocument & { ok: boolean }>('/notifications/preferences', {
    method: 'PUT',
    body: JSON.stringify(w),
    headers: { 'Content-Type': 'application/json' },
  })
