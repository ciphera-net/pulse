'use client'

import { useState, type ReactNode } from 'react'
import { FilePdf, Link as LinkIcon, PresentationChart, Trash } from '@phosphor-icons/react'
import { Button, toast } from '@ciphera-net/facet'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyRow, PanelRow, PanelRows, SettingsPanel } from '@/components/settings/panels'
import { StatusChip } from '@/components/settings/StatusChip'
import { cn } from '@/lib/utils'
import {
  deleteReport,
  downloadReportPdf,
  serverMessage,
  stopSchedule,
  type Report,
  type ReportSchedule,
} from '@/lib/api/reports'
import { comparePhrase, siteDay, spanLabel } from '@/lib/reports/format'
import { safeTimeZone } from '@/lib/utils/siteTime'
import type { Site } from '@/lib/api/sites'
import { ReportLinkChip, reportLinkOpen, type ReportsList } from './reportFields'

// "Your reports" (approved shots B-3, B-4, B-6): every report and every
// scheduled email for this site, under the tiles panel whichever tile is open.
// Colour lives in the chip's dot, never a panel. Making and deleting needs
// sites.edit; reading the list and its PDFs needs analytics.export, which the
// tab itself is gated on.

type Row =
  | { kind: 'report'; at: string; open: boolean; report: Report }
  | { kind: 'schedule'; at: string; open: true; schedule: ReportSchedule }

/** Live rows first (open links and running schedules), newest first; closed links after them. */
export function orderRows(reports: Report[], schedules: ReportSchedule[], now: Date): Row[] {
  const rows: Row[] = [
    ...reports.map((report) => ({ kind: 'report' as const, at: report.created_at, open: reportLinkOpen(report, now), report })),
    ...schedules.map((schedule) => ({ kind: 'schedule' as const, at: schedule.created_at, open: true as const, schedule })),
  ]
  return rows.sort((a, b) => Number(b.open) - Number(a.open) || b.at.localeCompare(a.at))
}

function Meta({ parts, dim }: { parts: string[]; dim?: boolean }) {
  return (
    <span className={cn('flex flex-wrap gap-x-2 gap-y-0.5', dim && 'opacity-60')}>
      {parts.map((p, i) => (
        <span key={i} className="inline-flex items-center gap-x-2">
          {i > 0 && <span aria-hidden="true">·</span>}
          <span>{p}</span>
        </span>
      ))}
    </span>
  )
}

const ICON_BUTTON = 'h-8 w-8 text-muted-foreground hover:bg-accent hover:text-foreground'
const DANGER_BUTTON = 'h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive'

export function YourReports({
  site,
  list,
  canEdit,
}: {
  site: Site
  list: ReportsList
  canEdit: boolean
}) {
  const timezone = safeTimeZone(site.timezone)
  const now = new Date()
  const year = Number(new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric' }).format(now))
  const [pdfBusy, setPdfBusy] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Report | null>(null)
  const [stopping, setStopping] = useState<ReportSchedule | null>(null)
  const [retrying, setRetrying] = useState(false)

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied.')
    } catch {
      toast.error("Couldn't copy the link. Open the report and copy it from the address bar.")
    }
  }

  const pdf = async (report: Report) => {
    if (pdfBusy) return
    setPdfBusy(report.id)
    try {
      await downloadReportPdf(site.id, report)
    } catch (err) {
      toast.error(serverMessage(err, "Couldn't make the PDF. Try again."))
    } finally {
      setPdfBusy(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleting) return
    try {
      await deleteReport(site.id, deleting.id)
      toast.success('The report is deleted. Its link no longer opens.')
      await list.reload()
    } catch (err) {
      toast.error(serverMessage(err, "Couldn't delete the report. Try again."))
    } finally {
      setDeleting(null)
    }
  }

  const confirmStop = async () => {
    if (!stopping) return
    try {
      await stopSchedule(site.id, stopping.id)
      toast.success('Stopped. No more reports will be made or emailed.')
      await list.reload()
    } catch (err) {
      toast.error(serverMessage(err, "Couldn't stop the emails. Try again."))
    } finally {
      setStopping(null)
    }
  }

  const retry = async () => {
    setRetrying(true)
    await list.reload()
    setRetrying(false)
  }

  let body: ReactNode
  if (list.failed && (list.reports === null || list.schedules === null)) {
    body = (
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <p className="text-sm text-muted-foreground">Couldn&apos;t load your reports.</p>
        <Button variant="outline" size="sm" onClick={retry} isLoading={retrying}>
          Try again
        </Button>
      </div>
    )
  } else if (list.reports === null || list.schedules === null) {
    body = (
      <div role="status" aria-busy="true" aria-label="Loading your reports" className="animate-skeleton-fade divide-y divide-border">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center justify-between gap-4 px-5 py-3.5">
            <div className="h-3.5 w-48 rounded-none bg-input" />
            <div className="h-5 w-32 rounded-none bg-input" />
          </div>
        ))}
      </div>
    )
  } else if (list.reports.length === 0 && list.schedules.length === 0) {
    body = (
      <EmptyRow
        icon={<PresentationChart />}
        title="No reports yet"
        caption={
          canEdit
            ? 'Make one with Growth report, or have one made and emailed every month with Scheduled email.'
            : 'Reports your team makes for this site appear here.'
        }
      />
    )
  } else {
    body = (
      <PanelRows>
        {orderRows(list.reports, list.schedules, now).map((row) => {
          if (row.kind === 'schedule') {
            const s = row.schedule
            const people = s.recipient_user_ids.length
            return (
              <PanelRow
                key={`s-${s.id}`}
                label={<span className="min-w-0 truncate">{s.name}</span>}
                caption={
                  <Meta
                    parts={[
                      `The ${s.every} before, made on the 1st`,
                      `emailed to ${people} ${people === 1 ? 'person' : 'people'}`,
                      `next ${siteDay(s.next_run_at, timezone, year)}`,
                    ]}
                  />
                }
                control={
                  <div className="flex items-center gap-3">
                    <StatusChip tone="info" dot>
                      {s.every === 'month' ? 'Every month' : 'Every quarter'}
                    </StatusChip>
                    {canEdit && (
                      <div className="flex shrink-0 items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className={DANGER_BUTTON}
                          aria-label={`Stop sending ${s.name}`}
                          onClick={() => setStopping(s)}
                        >
                          <Trash className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                }
              />
            )
          }

          const r = row.report
          const dim = !row.open
          const against = comparePhrase(r.from, r.to, r.compare)
          const parts = [spanLabel(r.from, r.to)]
          if (against) parts.push(`against ${against}`)
          parts.push(`made ${siteDay(r.created_at, timezone, year)}`)
          return (
            <PanelRow
              key={`r-${r.id}`}
              label={<span className={cn('min-w-0 truncate', dim && 'opacity-60')}>{r.name}</span>}
              caption={<Meta parts={parts} dim={dim} />}
              control={
                <div className="flex items-center gap-3">
                  <ReportLinkChip report={r} timezone={timezone} now={now} />
                  <div className="flex shrink-0 items-center justify-end gap-1">
                    {row.open && r.url && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className={ICON_BUTTON}
                        aria-label={`Copy the link to ${r.name}`}
                        onClick={() => copy(r.url!)}
                      >
                        <LinkIcon className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {/* A deleted report's numbers are gone, and so is its PDF. */}
                    {!r.revoked_at && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className={ICON_BUTTON}
                        aria-label={`Download the PDF of ${r.name}`}
                        aria-busy={pdfBusy === r.id}
                        disabled={pdfBusy === r.id}
                        onClick={() => pdf(r)}
                      >
                        <FilePdf className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {canEdit && !r.revoked_at && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className={DANGER_BUTTON}
                        aria-label={`Delete ${r.name}`}
                        onClick={() => setDeleting(r)}
                      >
                        <Trash className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              }
            />
          )
        })}
      </PanelRows>
    )
  }

  return (
    <>
      <SettingsPanel
        title="Your reports"
        description="A designed report of this site's growth, for investors, clients or your board. Its numbers are fixed when you make it."
      >
        {body}
      </SettingsPanel>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="Delete this report?"
        description={
          deleting
            ? `The link to "${deleting.name}" stops working and its numbers are deleted. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete report"
        variant="danger"
        onConfirm={confirmDelete}
      />
      <ConfirmDialog
        open={stopping !== null}
        onOpenChange={(open) => {
          if (!open) setStopping(null)
        }}
        title="Stop these emails?"
        description={
          stopping
            ? `"${stopping.name}" stops being made and emailed. Reports already sent keep their links.`
            : ''
        }
        confirmLabel="Stop sending"
        variant="danger"
        onConfirm={confirmStop}
      />
    </>
  )
}
