'use client'

import { useId, useState } from 'react'
import { Button, Checkbox, Input, Switcher, toast } from '@ciphera-net/facet'
import { PanelRow, PanelRows } from '@/components/settings/panels'
import { useAuth } from '@/lib/auth/context'
import { useMembers, type OrganizationMember } from '@/lib/swr/members'
import {
  createSchedule,
  serverMessage,
  type ReportCompare,
  type ReportEvery,
  type ReportPdfTheme,
  type ReportSection,
} from '@/lib/api/reports'
import { DEFAULT_SECTIONS, siteDay } from '@/lib/reports/format'
import { safeTimeZone } from '@/lib/utils/siteTime'
import type { Site } from '@/lib/api/sites'
import { COMPARE_OPTIONS, PDF_THEME_CAPTION, PDF_THEME_OPTIONS, SlidesField, orderedSections } from './reportFields'

// Settings → Export → Scheduled email (PULSE-134; approved shot B-4, owner
// rulings D4 and D7). On the 1st, pulse-backend freezes a report of the month
// or quarter that just ended and tells each chosen member through Iris, as
// product state about their own site. Recipients are TEAM MEMBERS ONLY (D7):
// anyone else gets the link from someone who received it.

const EVERY_OPTIONS: { value: ReportEvery; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
]

const EXPIRY_OPTIONS: { value: string; label: string }[] = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'never', label: 'Never' },
]

/**
 * A member's name on the Send to list, by the Members tab's own rule: "You"
 * for the signed-in person, the email when the backend has one, a short id
 * otherwise. Pulse stores no names, and a raw uuid is never a name.
 */
export function memberLabel(member: OrganizationMember, myId: string | undefined): string {
  if (member.user_id === myId) return 'You'
  return member.user_email || `Member ${member.user_id.slice(0, 8)}`
}

export function ScheduledEmailFlow({
  site,
  onCancel,
  onChanged,
}: {
  site: Site
  onCancel: () => void
  onChanged: () => void
}) {
  const idBase = useId()
  const timezone = safeTimeZone(site.timezone)
  const { user } = useAuth()
  const { list: members, error: membersError } = useMembers()
  const myId = user?.id

  const [name, setName] = useState('')
  const [every, setEvery] = useState<ReportEvery>('month')
  const [compare, setCompare] = useState<ReportCompare>('previous')
  const [sections, setSections] = useState<ReadonlySet<ReportSection>>(() => new Set(DEFAULT_SECTIONS))
  const [pdfTheme, setPdfTheme] = useState<ReportPdfTheme>('light')
  // Null until the reader changes it: the default is "You" alone, which needs
  // the signed-in id, and that can arrive after the first render.
  const [picked, setPicked] = useState<ReadonlySet<string> | null>(null)
  const [expiry, setExpiry] = useState('90')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)

  const recipients: ReadonlySet<string> = picked ?? new Set(myId ? [myId] : [])
  // You first, then everyone else as the team lists them.
  const roster = members
    ? [...members].sort((a, b) => Number(b.user_id === myId) - Number(a.user_id === myId))
    : null
  // Only people still on the team are ever sent (D7), whatever was ticked.
  const chosen = roster ? roster.filter((m) => recipients.has(m.user_id)).map((m) => m.user_id) : []

  const nameProblem = name.trim() ? null : 'Give the emails a name.'
  const slidesProblem = sections.size > 0 ? null : 'Choose at least one slide.'
  const recipientsProblem = chosen.length > 0 ? null : 'Choose at least one person.'
  const valid = !nameProblem && !slidesProblem && !recipientsProblem

  const reset = () => {
    setName('')
    setEvery('month')
    setCompare('previous')
    setSections(new Set(DEFAULT_SECTIONS))
    setPdfTheme('light')
    setPicked(null)
    setExpiry('90')
    setTried(false)
  }

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
      const year = new Date().getFullYear()
      toast.success(`Scheduled. The first report is made on ${siteDay(schedule.next_run_at, timezone, year)}.`)
      reset()
      onChanged()
    } catch (err) {
      toast.error(serverMessage(err, "Couldn't schedule the emails. Try again."))
    } finally {
      setBusy(false)
    }
  }

  const problem = (text: string | null) =>
    tried && text ? (
      <p role="alert" className="mt-1.5 text-xs text-destructive">
        {text}
      </p>
    ) : null

  return (
    <>
      <PanelRows>
        <PanelRow label="Name" htmlFor={`${idBase}-name`}>
          <Input
            id={`${idBase}-name`}
            placeholder="Monthly update"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
          />
          {problem(nameProblem)}
        </PanelRow>

        <PanelRow label="Every" caption="Made on the 1st, covering the month or quarter that just ended.">
          <Switcher
            size="sm"
            tone="solid"
            aria-label="Every"
            options={EVERY_OPTIONS}
            value={every}
            onChange={(v) => setEvery(v as ReportEvery)}
          />
        </PanelRow>

        <PanelRow label="Compare with">
          <Switcher
            size="sm"
            tone="solid"
            aria-label="Compare with"
            options={COMPARE_OPTIONS}
            value={compare}
            onChange={(v) => setCompare(v as ReportCompare)}
          />
        </PanelRow>

        <PanelRow label="Slides">
          <SlidesField value={sections} onChange={setSections} />
          {problem(slidesProblem)}
        </PanelRow>

        <PanelRow label="PDF" caption={PDF_THEME_CAPTION}>
          <Switcher
            size="sm"
            tone="solid"
            aria-label="PDF"
            options={PDF_THEME_OPTIONS}
            value={pdfTheme}
            onChange={(v) => setPdfTheme(v as ReportPdfTheme)}
          />
        </PanelRow>

        <PanelRow label="Send to" caption="Members of this team. Send the link to anyone else.">
          {roster ? (
            <div role="group" aria-label="Send to" className="flex flex-col gap-1.5">
              {roster.map((m) => (
                <Checkbox
                  key={m.user_id}
                  label={memberLabel(m, myId)}
                  checked={recipients.has(m.user_id)}
                  onChange={() => toggleRecipient(m.user_id)}
                />
              ))}
            </div>
          ) : membersError ? (
            <p className="text-sm text-muted-foreground">Couldn&apos;t load the team. Reload the page to try again.</p>
          ) : (
            <p className="text-sm text-muted-foreground" role="status">
              Loading the team…
            </p>
          )}
          {problem(recipientsProblem)}
        </PanelRow>

        <PanelRow label="Link expires" caption="Each email links to its own report.">
          <Switcher
            size="sm"
            tone="solid"
            aria-label="Link expires"
            options={EXPIRY_OPTIONS}
            value={expiry}
            onChange={setExpiry}
          />
        </PanelRow>
      </PanelRows>

      <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => {
            reset()
            onCancel()
          }}
        >
          Cancel
        </Button>
        <Button size="sm" onClick={submit} isLoading={busy} aria-busy={busy}>
          Start sending
        </Button>
      </div>
    </>
  )
}
