'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Toggle, toast, getAuthErrorMessage } from '@ciphera-net/facet'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { SettingsErrorState } from '@/components/settings/SettingsErrorState'
import { SettingsPanel, PanelRow, PanelRows, EmptyRow } from '@/components/settings/panels'
import { StatusChip } from '@/components/settings/StatusChip'
import {
  getPrefsDocument,
  updatePrefs,
  type CategoryPreferenceDoc,
  type PreferencesDocument,
} from '@/lib/api/notifications-preferences'
import { NOTIFICATION_CATEGORIES } from '@/lib/notifications/categories'
import { useTeamState } from '@/lib/hooks/useTeamState'

/**
 * Account, Notifications: one switch per category (owner rulings 21-09-2026,
 * direction A of the options round the same day).
 *
 * Every notification shows in the app the moment it happens. Email is instant
 * too, and the only control a person has is email on or off per category.
 * Billing and Security cannot be switched off. There is no digest, no
 * schedule, no mute, no in-app toggle and nothing about retention on this
 * page; the retention windows are the registry's and cleanup is automatic.
 *
 * Truths this page renders, never enforces:
 * - A category that cannot be suppressed (registry `suppressible`) shows an
 *   "Always on" chip and no switch. Iris's trigger is the enforcement; the
 *   chip is its rendering, and it reads the SAME column the trigger reads.
 * - The registry is the vocabulary: display names come from the wire, never
 *   a local table. The captions below are this page's own copy, keyed by the
 *   immutable category id.
 * - A save writes ONE boolean for ONE category and adopts the server's
 *   re-read document as the new state, never an optimistic guess.
 */

const CAPTIONS: Record<string, string> = {
  billing: 'Invoices, failed payments, renewals and your pageview quota.',
  security: 'New device sign-ins, password changes, API keys.',
  uptime: 'A monitored site going down or recovering, and certificates about to expire.',
  site: 'Tracking issues, performance changes, exports that are ready.',
  team: 'People joining your team and role changes.',
  system: 'Announcements and scheduled maintenance from Ciphera.',
  lifecycle: 'Nudges while your account is being set up.',
}

const ORDER = NOTIFICATION_CATEGORIES.map((c) => c.id as string)

// * PULSE-59: nothing in the Team category can reach somebody who works alone
// * (people joining, role changes), so the row is not shown to them until they
// * have a team. Hidden on this page only: the server's category and the stored
// * preference are untouched, and the row returns in team state. null (not
// * known yet, or the lookup failed) shows it, like every other surface.
function visibleTo(categoryId: string, alone: boolean): boolean {
  return !(alone && categoryId === 'team')
}

export default function MyPreferencesTab() {
  const alone = useTeamState() === 'alone'
  const [doc, setDoc] = useState<PreferencesDocument | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = () =>
    getPrefsDocument()
      .then((d) => { setDoc(d); setError(null) })
      .catch((e) =>
        setError(
          (e as Error).message ||
            "Couldn't load your notification preferences. Try again in a moment.",
        ),
      )

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const retry = async () => {
    setRetrying(true)
    await load()
    setRetrying(false)
  }

  /**
   * One category's write. A 422 is the trigger speaking (email off for an
   * unsuppressible category) and is surfaced verbatim; the document in state
   * is always the server's answer.
   */
  const writeEmail = useCallback(
    async (categoryId: string, email: boolean) => {
      if (!doc || saving) return
      setSaving(true)
      try {
        const next = await updatePrefs({ categories: { [categoryId]: { email } } })
        setDoc(Array.isArray(next?.categories) ? next : await getPrefsDocument())
      } catch (err) {
        toast.error(
          getAuthErrorMessage(err as Error) ||
            (err as Error).message ||
            "Couldn't save your changes. Try again in a moment.",
        )
      } finally {
        setSaving(false)
      }
    },
    [doc, saving],
  )

  const categories = useMemo(() => {
    const byId = new Map((doc?.categories ?? []).map((c) => [c.category_id, c]))
    return ORDER.filter((id) => visibleTo(id, alone))
      .map((id) => byId.get(id))
      .filter(Boolean) as CategoryPreferenceDoc[]
  }, [doc, alone])

  if (error && !doc) {
    return (
      <SettingsErrorState
        title="Couldn't load your notification preferences"
        message={error}
        onRetry={retry}
        retrying={retrying}
      />
    )
  }
  if (!doc) return <SettingsLoadingState />

  return (
    <div className="space-y-8">
      <SettingsPanel
        title="Email"
        description={`Every notification shows in the app the moment it happens. Email is instant too. Switch it off per category. ${alone ? 'These settings are yours.' : "These settings are yours, not the team's."}`}
      >
        {categories.length === 0 ? (
          <EmptyRow
            title="No notification categories"
            caption="Categories appear here once the registry has data for your account."
          />
        ) : (
          <PanelRows>
            {categories.map((cat) => (
              <PanelRow
                key={cat.category_id}
                label={cat.display_name}
                caption={CAPTIONS[cat.category_id]}
                control={
                  cat.suppressible ? (
                    <Toggle
                      checked={cat.email}
                      disabled={saving}
                      aria-label={`Email for ${cat.display_name}`}
                      onChange={() => void writeEmail(cat.category_id, !cat.email)}
                    />
                  ) : (
                    <StatusChip tone="neutral">Always on</StatusChip>
                  )
                }
              />
            ))}
          </PanelRows>
        )}
      </SettingsPanel>
    </div>
  )
}
