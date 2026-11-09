'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Toggle, toast } from '@ciphera-net/facet'
import { EnvelopeSimple, WarningCircle } from '@phosphor-icons/react'
import { useAuth } from '@/lib/auth/context'
import { useFeature } from '@/lib/features'
import { useTeamState } from '@/lib/hooks/useTeamState'
import {
  getPrefsDocument,
  updatePrefs,
  type CategoryPreferenceDoc,
  type PreferencesDocument,
} from '@/lib/api/notifications-preferences'
import { NOTIFICATION_CATEGORIES } from '@/lib/notifications/categories'
import { KitPage, KitRow, KitRows, KitSection } from '@/components/settings/kit/Kit'
import SettingsLoadingState from '@/components/settings/SettingsLoadingState'
import { SignInEmails } from './SignInEmails'
import { ReportsAndInvoices } from './ReportsAndInvoices'

/**
 * Settings → Notifications (settings overhaul P11, PUL-42): every email switch on a page of its own (R41), only the
 * person's own (R42), grouped by sender (R43): Pulse's email groups, then the sign-in emails Ciphera ID sends, then
 * where the team's two emails are set (Reports and invoices). Drawn with the kit in the copy deck's words (§12.7,
 * §13); approved drawing: the mock branch's NotificationsMock, options G and I. Keeps today's route, which the
 * "Change preferences" link in every Pulse email opens.
 *
 * Every switch acts at once, as before: there is no draft and no save bar.
 *
 * Pulse's groups render the registry's truth, never enforce it:
 * - A group that cannot be suppressed (registry `suppressible`) says "Always on" and has no switch. Iris's trigger is
 *   the enforcement; the words read the same column the trigger reads.
 * - Display names come from the wire; the captions are this page's own words, keyed by the immutable category id.
 * - A write sends ONE boolean for ONE group and adopts the server's re-read document, never an optimistic guess.
 */

// Copy deck §12.7, and §13.3 for the three emails added on 07-11-2026: a role change (Team), a dashboard shared by link
// (Security) and a goal's first conversion (Site activity).
const CAPTIONS: Record<string, string> = {
  billing: 'Renewals, plan changes and event use. Invoices, failed payments and refunds go to the billing email.',
  security: 'A new API key, or a dashboard shared by link, in your team.',
  uptime: 'A monitored site going down or coming back, a certificate about to expire, and a tracking script that goes quiet.',
  // The scheduled report email is in this group, so its line names growth reports (§13.2, found while drawing 1).
  site: "Performance scores that drop or recover, pages losing visits, a goal's first conversion, finished imports and growth reports.",
  // Sent to the member whose role changed, and to nobody else (pulse-backend announceRoleChange).
  team: 'A change to your role in the team.',
  system: 'Announcements and scheduled maintenance from Ciphera.',
  lifecycle: 'Help with setting up a site, the first visits arriving, and a note if your team goes quiet.',
  summary: "Every Monday: last week's visitors, top pages and top sources for each site that had visits.",
  summary_monthly: "On the 1st of each month: last month's visitors, top pages and top sources for each site that had visits.",
}

// The monthly summary is a beta (lib/betas.ts): its row shows only once /me says the beta is on for the team, so
// nobody is offered a switch for an email their team does not get. null (not known yet) hides it.
const MONTHLY_SUMMARY_BETA = 'monthly-summary'

/** Iris's preferences document: null until the first answer; `failed` when the read failed with nothing to show. */
function usePrefsDocument() {
  const [doc, setDoc] = useState<PreferencesDocument | null>(null)
  const [failed, setFailed] = useState(false)
  const [retrying, setRetrying] = useState(false)

  const load = useCallback(
    () =>
      getPrefsDocument()
        .then((d) => {
          setDoc(d)
          setFailed(false)
        })
        .catch(() => setFailed(true)),
    [],
  )

  useEffect(() => {
    void load()
  }, [load])

  const retry = async () => {
    setRetrying(true)
    await load()
    setRetrying(false)
  }

  return { doc, setDoc, failed, retry, retrying }
}

export default function NotificationsPage() {
  const { user } = useAuth()
  const alone = useTeamState() === 'alone'
  const monthlyBeta = useFeature(MONTHLY_SUMMARY_BETA) === true
  const { doc, setDoc, failed, retry, retrying } = usePrefsDocument()
  const [saving, setSaving] = useState(false)

  // One group's write. The server's answer is the new state; a refusal (a 422 from Iris's trigger, or anything else)
  // leaves the switch where the server last said it was.
  const writeEmail = useCallback(
    async (categoryId: string, email: boolean) => {
      if (saving) return
      setSaving(true)
      try {
        const next = await updatePrefs({ categories: { [categoryId]: { email } } })
        setDoc(Array.isArray(next?.categories) ? next : await getPrefsDocument())
      } catch {
        toast.error("Couldn't save. Try again.")
      } finally {
        setSaving(false)
      }
    },
    [saving, setDoc],
  )

  // The registry's list is the page's order AND its filter: the document also carries groups this page never shows
  // (Ciphera ID's own, and internal ones for staff), so a group is drawn only when this list names it (§12.11.1).
  // Team is drawn for everyone, somebody alone in this team included: the switches are the person's across every team
  // (one document per person), so they may have teammates elsewhere (§13.3). The weekly summary is drawn for everyone
  // too since 09-11-2026, when it left beta. The monthly summary is drawn only while its beta is on for the team.
  const groups = useMemo(() => {
    const byId = new Map((doc?.categories ?? []).map((c) => [c.category_id, c]))
    return NOTIFICATION_CATEGORIES.filter((k) => k.id !== 'summary_monthly' || monthlyBeta)
      .map((k) => byId.get(k.id))
      .filter((c): c is CategoryPreferenceDoc => c !== undefined)
  }, [doc, monthlyBeta])

  if (!user || (!doc && !failed)) return <SettingsLoadingState rows={6} />

  return (
    <KitPage>
      <KitSection
        title="Pulse emails"
        description={alone ? 'Pulse emails you when these happen.' : "Pulse emails you when these happen. Each switch is yours alone, not the team's."}
        icon={<EnvelopeSimple />}
      >
        <KitRows>
          {!doc ? (
            <KitRow
              state
              icon={<WarningCircle weight="fill" />}
              tone="coral"
              label="Couldn't load your email settings"
              control={
                <Button variant="outline" size="sm" onClick={() => void retry()} disabled={retrying}>
                  Try again
                </Button>
              }
            />
          ) : groups.length === 0 ? (
            <KitRow label="No emails to set up yet" caption="They show here once Pulse has some for your account." />
          ) : (
            groups.map((c) => (
              <div key={c.category_id} data-notif-email-group={c.category_id}>
                <KitRow
                  label={c.display_name}
                  caption={CAPTIONS[c.category_id]}
                  control={
                    c.suppressible ? (
                      <Toggle
                        checked={c.email}
                        disabled={saving}
                        aria-label={`Email for ${c.display_name}`}
                        onChange={() => void writeEmail(c.category_id, !c.email)}
                      />
                    ) : (
                      <span data-notif-always="" className="text-xs text-muted-foreground">Always on</span>
                    )
                  }
                />
              </div>
            ))
          )}
        </KitRows>
      </KitSection>

      <SignInEmails />

      <ReportsAndInvoices alone={alone} />
    </KitPage>
  )
}
