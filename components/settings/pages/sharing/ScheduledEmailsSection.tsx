'use client'

import { useEffect, useRef, useState } from 'react'
import { EnvelopeSimple, Prohibit, Trash } from '@phosphor-icons/react'
import { Button, toast } from '@ciphera-net/facet'
import { HoldDialog, useUndo } from '@ciphera-net/facet-hold'
import { listSchedules, stopSchedule, type ReportSchedule } from '@/lib/api/reports'
import type { Site } from '@/lib/api/sites'
import { siteDay } from '@/lib/reports/format'
import { safeTimeZone } from '@/lib/utils/siteTime'
import { usePendingKeys, whilePending } from '@/lib/hold/pending'
import { KitDialogTitle, KitRow, KitSection, KitStatus } from '@/components/settings/kit/Kit'
import { cn } from '@/lib/utils'
import { isGone, stopError } from './errors'
import { ScheduleForm } from './ScheduleForm'
import { DANGER_BUTTON, ListBody, ROW_BUTTONS, siteYear, useSiteList } from './parts'

/**
 * Sharing → Scheduled emails (copy deck §6.4, §6.5; R22 to R24). They stay on Sharing (R42: the Notifications page
 * only links here). The section's button opens the form above the list; each running schedule is a row that leads its
 * caption with how often it runs, with its stop button on the section's right edge (R24). Members read the list;
 * scheduling and stopping is for people with sites.edit (R23).
 */
export function ScheduledEmailsSection({ site, canEdit }: { site: Site; canEdit: boolean }) {
  const timezone = safeTimeZone(site.timezone)
  const list = useSiteList(site.id, listSchedules)
  const [open, setOpen] = useState(false)
  // The schedule the stop dialog is about. Kept while the dialog closes, so its title never changes under it.
  const [stopping, setStopping] = useState<ReportSchedule | null>(null)
  const [stopOpen, setStopOpen] = useState(false)
  const { defer } = useUndo()
  // A schedule waiting behind the Undo bar is hidden now (PUL-28).
  const pendingKeys = usePendingKeys()

  // Closing the form takes its buttons away: the cursor goes back to the section's button.
  const newButton = useRef<HTMLButtonElement>(null)
  const refocus = useRef(false)
  useEffect(() => {
    if (refocus.current && newButton.current) {
      newButton.current.focus()
      refocus.current = false
    }
  })
  const close = () => {
    refocus.current = true
    setOpen(false)
  }

  const year = siteYear(timezone, new Date())

  // The schedule disappears at once, and stops only when the 6-second Undo window runs out (PUL-28).
  const confirmStop = () => {
    if (!stopping) return
    const { id, name } = stopping
    defer(
      whilePending(`report-schedule:${id}`, {
        message: `"${name}" emails stopped`,
        commit: ({ keepalive }: { keepalive: boolean }) => stopSchedule(site.id, id, { keepalive }),
        onCommitted: () => list.reload(),
        onError: (err: unknown) => {
          toast.error(stopError(err, name))
          if (isGone(err)) void list.reload()
        },
      }),
    )
  }

  const rows =
    list.items === null
      ? null
      : list.items
          .filter((s) => !pendingKeys.has(`report-schedule:${s.id}`))
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map((s) => {
            const people = s.recipient_user_ids.length
            const quarter = s.every === 'quarter'
            return (
              <KitRow
                key={s.id}
                label={s.name}
                caption={
                  <>
                    <KitStatus tone="live">{quarter ? 'Every quarter' : 'Every month'}</KitStatus>
                    {` · Covers the ${quarter ? 'quarter' : 'month'} before · emailed to ${people} ${people === 1 ? 'person' : 'people'} · next on ${siteDay(s.next_run_at, timezone, year)}`}
                  </>
                }
                control={
                  canEdit ? (
                    <span data-sharing-row="schedule" data-sharing-buttons="" className={ROW_BUTTONS}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={DANGER_BUTTON}
                        aria-label={`Stop sending ${s.name}`}
                        aria-haspopup="dialog"
                        onClick={() => {
                          setStopping(s)
                          setStopOpen(true)
                        }}
                      >
                        <Trash className="h-3.5 w-3.5" />
                      </Button>
                    </span>
                  ) : undefined
                }
              />
            )
          })

  const formShown = canEdit && open

  return (
    <>
      <KitSection
        title="Scheduled emails"
        description="On the 1st, Pulse makes a growth report of the past month or quarter and emails its link to the people you pick."
        icon={<EnvelopeSimple />}
        aside={
          canEdit && !formShown ? (
            <Button ref={newButton} size="sm" variant="outline" onClick={() => setOpen(true)} data-sharing-new="schedule">
              Schedule emails
            </Button>
          ) : null
        }
      >
        {formShown && (
          <ScheduleForm
            site={site}
            onCancel={close}
            onScheduled={() => {
              close()
              void list.reload()
            }}
          />
        )}
        <div className={cn(formShown && 'border-t border-border')}>
          <ListBody kind="schedules" rows={rows} failed={list.failed} onRetry={list.reload} empty="No scheduled emails yet" />
        </div>
      </KitSection>

      {stopping && (
        <HoldDialog
          open={stopOpen}
          onOpenChange={setStopOpen}
          title={<KitDialogTitle icon={<Prohibit weight="bold" />}>{`Stop "${stopping.name}" emails?`}</KitDialogTitle>}
          description={`No more reports are made or emailed for "${stopping.name}". Reports already sent keep working until their links expire. After 6 seconds this can't be undone.`}
          holdLabel="Hold to stop"
          icon={<Prohibit weight="bold" className="h-4 w-4" aria-hidden="true" />}
          onConfirm={confirmStop}
        />
      )}
    </>
  )
}
