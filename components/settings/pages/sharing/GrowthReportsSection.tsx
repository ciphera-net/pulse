'use client'

import { useEffect, useRef, useState } from 'react'
import { FilePdf, Link as LinkIcon, PresentationChart, Trash } from '@phosphor-icons/react'
import { Button, toast } from '@ciphera-net/facet'
import { HoldDialog, useUndo } from '@ciphera-net/facet-hold'
import { deleteReport, downloadReportPdf, listReports, type Report } from '@/lib/api/reports'
import type { Site } from '@/lib/api/sites'
import { comparePhrase, siteDay, spanLabel } from '@/lib/reports/format'
import { safeTimeZone } from '@/lib/utils/siteTime'
import { usePendingKeys, whilePending } from '@/lib/hold/pending'
import { reportLinkOpen } from '@/components/settings/export/reportFields'
import { KitDialogTitle, KitRow, KitSection, KitStatus } from '@/components/settings/kit/Kit'
import { cn } from '@/lib/utils'
import { deleteError, isGone, pdfError } from './errors'
import { GrowthReportForm, ReportMade, type MadeReport } from './GrowthReportForm'
import { DANGER_BUTTON, ICON_BUTTON, ListBody, ROW_BUTTONS, linkWords, siteYear, useSiteList } from './parts'

/**
 * Sharing → Growth reports (copy deck §6.3, §6.5; R22 to R25). The section's button opens the form above the list; the
 * report it makes shows in the form's place until Done. The list holds every report not deleted (R25: a deleted report
 * leaves the list; an expired one stays, its PDF and delete still working), live links first, newest first. Each row
 * leads its caption with its link's state and keeps its buttons in the same places, copy dimmed on a closed link (R24).
 * Members read the list and download PDFs; making and deleting is for people with sites.edit (R23).
 */
export function GrowthReportsSection({ site, canEdit }: { site: Site; canEdit: boolean }) {
  const timezone = safeTimeZone(site.timezone)
  const list = useSiteList(site.id, listReports)
  const [open, setOpen] = useState(false)
  const [made, setMade] = useState<MadeReport | null>(null)
  const [pdfBusy, setPdfBusy] = useState<string | null>(null)
  // The report the delete dialog is about. Kept while the dialog closes, so its title never changes under it.
  const [deleting, setDeleting] = useState<Report | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const { defer } = useUndo()
  // A report waiting behind the Undo bar is hidden now (PUL-28).
  const pendingKeys = usePendingKeys()

  // Closing the form or the made report takes their buttons away: the cursor goes back to the section's button.
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
    setMade(null)
  }

  const now = new Date()
  const year = siteYear(timezone, now)

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied')
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
      toast.error(pdfError(err))
      // Deleted somewhere else: read the list again so the row leaves it.
      if (isGone(err)) void list.reload()
    } finally {
      setPdfBusy(null)
    }
  }

  // The report disappears at once; the delete is sent when the 6-second Undo window runs out (PUL-28).
  const confirmDelete = () => {
    if (!deleting) return
    const { id, name } = deleting
    defer(
      whilePending(`report:${id}`, {
        message: `"${name}" deleted`,
        commit: ({ keepalive }: { keepalive: boolean }) => deleteReport(site.id, id, { keepalive }),
        onCommitted: () => list.reload(),
        onError: (err: unknown) => {
          toast.error(deleteError(err, name))
          if (isGone(err)) void list.reload()
        },
      }),
    )
  }

  const rows =
    list.items === null
      ? null
      : list.items
          .filter((r) => !r.revoked_at && !pendingKeys.has(`report:${r.id}`))
          .sort((a, b) => Number(reportLinkOpen(b, now)) - Number(reportLinkOpen(a, now)) || b.created_at.localeCompare(a.created_at))
          .map((r) => {
            const linkOpen = reportLinkOpen(r, now)
            const against = comparePhrase(r.from, r.to, r.compare)
            const parts = [spanLabel(r.from, r.to), against && `against ${against}`, `made ${siteDay(r.created_at, timezone, year)}`]
              .filter(Boolean)
              .join(' · ')
            return (
              <KitRow
                key={r.id}
                label={r.name}
                caption={
                  <>
                    <KitStatus tone={linkOpen ? 'live' : 'off'}>{linkWords(r, timezone, now)}</KitStatus> · {parts}
                  </>
                }
                control={
                  <span data-sharing-row="report" data-sharing-buttons="" className={ROW_BUTTONS}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={ICON_BUTTON}
                      disabled={!linkOpen || !r.url}
                      title={linkOpen ? undefined : 'The link is closed'}
                      aria-label={`Copy the link to ${r.name}`}
                      onClick={() => {
                        if (r.url) void copy(r.url)
                      }}
                    >
                      <LinkIcon className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={ICON_BUTTON}
                      aria-label={`Download the PDF of ${r.name}`}
                      aria-busy={pdfBusy === r.id}
                      disabled={pdfBusy === r.id}
                      onClick={() => void pdf(r)}
                    >
                      <FilePdf className="h-3.5 w-3.5" />
                    </Button>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className={DANGER_BUTTON}
                        aria-label={`Delete ${r.name}`}
                        aria-haspopup="dialog"
                        onClick={() => {
                          setDeleting(r)
                          setDeleteOpen(true)
                        }}
                      >
                        <Trash className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </span>
                }
              />
            )
          })

  const formShown = canEdit && (open || made !== null)

  return (
    <>
      <KitSection
        title="Growth reports"
        description="A designed report of this site's growth, for investors, clients or your board. Its numbers are fixed when you make it."
        icon={<PresentationChart />}
        aside={
          canEdit && !formShown ? (
            <Button ref={newButton} size="sm" variant="outline" onClick={() => setOpen(true)} data-sharing-new="report">
              New growth report
            </Button>
          ) : null
        }
      >
        {canEdit && made && <ReportMade site={site} made={made} onDone={close} />}
        {canEdit && !made && open && (
          <GrowthReportForm
            site={site}
            onCancel={close}
            onMade={(m) => {
              setMade(m)
              setOpen(false)
              void list.reload()
            }}
          />
        )}
        <div className={cn(formShown && 'border-t border-border')}>
          <ListBody kind="reports" rows={rows} failed={list.failed} onRetry={list.reload} empty="No growth reports yet" />
        </div>
      </KitSection>

      {deleting && (
        <HoldDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title={<KitDialogTitle icon={<Trash weight="bold" />}>{`Delete "${deleting.name}"?`}</KitDialogTitle>}
          description="The link stops working, and the report's numbers and PDF are deleted. After 6 seconds this can't be undone."
          holdLabel="Hold to delete"
          icon={<Trash weight="bold" className="h-4 w-4" aria-hidden="true" />}
          onConfirm={confirmDelete}
        />
      )}
    </>
  )
}
