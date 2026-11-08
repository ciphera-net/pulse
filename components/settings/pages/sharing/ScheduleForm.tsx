'use client'

import { useId, useState } from 'react'
import { Button, Checkbox, Input, Switcher, toast } from '@ciphera-net/facet'
import { useAuth } from '@/lib/auth/context'
import { useMembers } from '@/lib/swr/members'
import {
  createSchedule,
  type ReportCompare,
  type ReportEvery,
  type ReportPdfTheme,
  type ReportSection,
} from '@/lib/api/reports'
import type { Site } from '@/lib/api/sites'
import { DEFAULT_SECTIONS, siteDay } from '@/lib/reports/format'
import { safeTimeZone } from '@/lib/utils/siteTime'
import {
  COMPARE_OPTIONS,
  PDF_THEME_CAPTION,
  PDF_THEME_OPTIONS,
  SlidesField,
  orderedSections,
} from '@/components/settings/export/reportFields'
import { KitRow, KitRows } from '@/components/settings/kit/Kit'
import { MAX_RECIPIENTS, TOO_MANY_PEOPLE, scheduleError } from './errors'
import { FormFooter, Problem, siteYear } from './parts'
import { RecipientLabel } from '@/components/settings/names/people'
import { sendToCaption } from '@/components/settings/names/prompt'
import { usePeopleEmails } from '@/components/settings/names/useEmails'
import { usePeopleNames } from '@/components/settings/names/useNames'

// Sharing → Scheduled emails: the form (copy deck §6.4; approved as shot B-4, drawn here in the kit). On the 1st,
// pulse-backend freezes a report of the month or quarter that just ended and tells each chosen member through Iris.
// Recipients are TEAM MEMBERS ONLY (D7): anyone else gets the link from someone who received it.

const SEND_TO_CAPTION = 'Only members of this team get the email. Forward the link to anyone else.'

const EVERY_OPTIONS: { value: ReportEvery; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
]

const EXPIRY_OPTIONS: { value: string; label: string }[] = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'never', label: 'Never' },
]

export function ScheduleForm({ site, onCancel, onScheduled }: { site: Site; onCancel: () => void; onScheduled: () => void }) {
  const idBase = useId()
  const timezone = safeTimeZone(site.timezone)
  const { user } = useAuth()
  const { list: members, error: membersError } = useMembers()
  const myId = user?.id
  // Each teammate's name, role and id, and the page's line in the caption (design §7, R63).
  const names = usePeopleNames()
  // An owner's or admin's list shows each teammate's address beside the name (R74).
  const emails = usePeopleEmails()

  const [name, setName] = useState('')
  const [every, setEvery] = useState<ReportEvery>('month')
  const [compare, setCompare] = useState<ReportCompare>('previous')
  const [sections, setSections] = useState<ReadonlySet<ReportSection>>(() => new Set(DEFAULT_SECTIONS))
  const [pdfTheme, setPdfTheme] = useState<ReportPdfTheme>('light')
  // Null until the reader changes it: the default is "You" alone, which needs the signed-in id, and that can arrive
  // after the first render.
  const [picked, setPicked] = useState<ReadonlySet<string> | null>(null)
  const [expiry, setExpiry] = useState('90')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)

  const recipients: ReadonlySet<string> = picked ?? new Set(myId ? [myId] : [])
  // You first, then everyone else as the team lists them.
  const roster = members ? [...members].sort((a, b) => Number(b.user_id === myId) - Number(a.user_id === myId)) : null
  // Only people still on the team are ever sent (D7), whatever was ticked.
  const chosen = roster ? roster.filter((m) => recipients.has(m.user_id)).map((m) => m.user_id) : []

  const nameProblem = name.trim() ? null : 'Give the emails a name.'
  const slidesProblem = sections.size > 0 ? null : 'Pick at least one slide.'
  const recipientsProblem =
    chosen.length === 0 ? 'Pick at least one person.' : chosen.length > MAX_RECIPIENTS ? TOO_MANY_PEOPLE : null
  const valid = !nameProblem && !slidesProblem && !recipientsProblem

  const toggleRecipient = (id: string) => {
    const next = new Set(recipients)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setPicked(next)
  }

  const submit = async () => {
    setTried(true)
    if (!valid || busy) return
    setBusy(true)
    try {
      const schedule = await createSchedule(site.id, {
        name: name.trim(),
        every,
        compare,
        sections: orderedSections(sections),
        pdf_theme: pdfTheme,
        expires_in_days: expiry === 'never' ? null : (Number(expiry) as 30 | 90),
        recipient_user_ids: chosen,
      })
      toast.success(`Scheduled. The first report is made on ${siteDay(schedule.next_run_at, timezone, siteYear(timezone, new Date()))}.`)
      onScheduled()
    } catch (err) {
      toast.error(scheduleError(err))
    } finally {
      setBusy(false)
    }
  }

  const shown = (text: string | null) => (tried ? text : null)

  return (
    <div data-sharing-form="schedule">
      <KitRows>
        <KitRow label="Name" htmlFor={`${idBase}-name`}>
          <Input
            id={`${idBase}-name`}
            placeholder="Monthly update"
            value={name}
            maxLength={120}
            // The form opens from the section's button, which leaves the page: the cursor goes to the first field.
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
          <Problem text={shown(nameProblem)} />
        </KitRow>

        <KitRow label="Every" caption="Made on the 1st, in this site's timezone.">
          <Switcher
            size="sm"
            tone="solid"
            aria-label="Every"
            options={EVERY_OPTIONS}
            value={every}
            onChange={(v) => setEvery(v as ReportEvery)}
          />
        </KitRow>

        <KitRow label="Compare with">
          <Switcher
            size="sm"
            tone="solid"
            aria-label="Compare with"
            options={COMPARE_OPTIONS}
            value={compare}
            onChange={(v) => setCompare(v as ReportCompare)}
          />
        </KitRow>

        <KitRow label="Slides">
          <SlidesField value={sections} onChange={setSections} />
          <Problem text={shown(slidesProblem)} />
        </KitRow>

        <KitRow label="PDF" caption={PDF_THEME_CAPTION}>
          <Switcher
            size="sm"
            tone="solid"
            aria-label="PDF"
            options={PDF_THEME_OPTIONS}
            value={pdfTheme}
            onChange={(v) => setPdfTheme(v as ReportPdfTheme)}
          />
        </KitRow>

        <KitRow label="Send to" caption={sendToCaption(SEND_TO_CAPTION, names.lineFor((roster ?? []).map((m) => m.user_id)))}>
          {roster ? (
            <div role="group" aria-label="Send to" className="flex flex-col gap-1.5">
              {roster.map((m) => {
                const email = emails.of(m.user_id)
                return (
                  <Checkbox
                    key={m.user_id}
                    label={<RecipientLabel member={m} who={names.who(m.user_id, true)} email={email} />}
                    checked={recipients.has(m.user_id)}
                    onChange={() => toggleRecipient(m.user_id)}
                  />
                )
              })}
            </div>
          ) : membersError ? (
            <p className="text-sm text-muted-foreground">Couldn&apos;t load the team. Reload the page to try again.</p>
          ) : (
            <p className="text-sm text-muted-foreground" role="status">
              Loading the team…
            </p>
          )}
          <Problem text={shown(recipientsProblem)} />
        </KitRow>

        <KitRow label="Link expires" caption="Each email links to its own report.">
          <Switcher size="sm" tone="solid" aria-label="Link expires" options={EXPIRY_OPTIONS} value={expiry} onChange={setExpiry} />
        </KitRow>
      </KitRows>

      <FormFooter>
        <Button variant="outline" size="sm" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={submit} isLoading={busy} aria-busy={busy}>
          Start sending
        </Button>
      </FormFooter>
    </div>
  )
}
