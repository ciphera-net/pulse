import apiRequest from '@/lib/api/client'

// ── The preferences document (21-09-2026: one switch per category) ─────────
//
// Iris's preferences document rides the proxy GET verbatim. Category metadata
// (display names, criticality, suppressible) comes from the wire, never from
// a client-side table. A person's whole expression for a category is `email`:
// in-app is always on (the receipt IS the in-app delivery), and digest, quiet
// hours, mute, the in-app toggle and the retention override were retired by
// owner ruling on 21-09-2026 (plan
// docs/plans/21-09-2026-notification-simplification-plan.md, workspace root).
//
// Only the fields this app reads are typed. Iris release A still carries the
// retired fields at neutral values and release B removes them; typing them
// here would let a component read a field that is about to vanish.

export interface CategoryPreferenceDoc {
  category_id: string
  display_name: string
  criticality: 'critical' | 'standard' | 'low'
  /**
   * The trigger's own column: a category that cannot be suppressed cannot
   * have email switched off. The page renders its locked state from THIS,
   * not from `criticality`, so the rendering and the refusal read the same
   * fact (review catch, 31-08).
   */
  suppressible: boolean
  /** The registry default, reported beside the effective value. */
  default_email: boolean
  /** Effective value: the stored row when one exists, else the default. */
  email: boolean
  /** True when the user chose this; false when it is the registry default. */
  stored: boolean
}

export interface PreferencesDocument {
  product: string
  categories: CategoryPreferenceDoc[]
}

/**
 * One category's write. `email` is the whole expression; the proxy forwards
 * exactly `{"categories":{"<id>":{"email":bool}}}` to Iris, and Iris's
 * trigger refuses email off for an unsuppressible category with a 422 that
 * the proxy surfaces verbatim.
 */
export interface CategoryWrite {
  email: boolean
}

export interface PrefsWrite {
  categories: Record<string, CategoryWrite>
}

export const getPrefsDocument = () =>
  apiRequest<PreferencesDocument>('/notifications/preferences')

/** The PUT answers with the stored truth re-read, plus `ok`. */
export const updatePrefs = (w: PrefsWrite) =>
  apiRequest<PreferencesDocument & { ok: boolean }>('/notifications/preferences', {
    method: 'PUT',
    body: JSON.stringify(w),
    headers: { 'Content-Type': 'application/json' },
  })
