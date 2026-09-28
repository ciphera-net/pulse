'use client'

import { useCallback, useEffect, useState } from 'react'
import { Checkbox } from '@ciphera-net/facet'
import { StatusChip } from '@/components/settings/StatusChip'
import {
  listReports,
  listSchedules,
  REPORT_SECTIONS,
  type Report,
  type ReportCompare,
  type ReportPdfTheme,
  type ReportSchedule,
  type ReportSection,
} from '@/lib/api/reports'
import { SECTION_LABELS, siteDay } from '@/lib/reports/format'

// The pieces the Growth report and Scheduled email forms share (approved
// shots B-3 and B-4, design §6.1b R2, R3, R5), and the one loader behind
// "Your reports".

export const COMPARE_OPTIONS: { value: ReportCompare; label: string }[] = [
  { value: 'previous', label: 'The period before' },
  { value: 'year', label: 'Same period last year' },
  { value: 'none', label: 'Nothing' },
]

export const PDF_THEME_OPTIONS: { value: ReportPdfTheme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export const PDF_THEME_CAPTION = 'Light prints well and sits on a white slide. Dark looks like Pulse.'

/** Six checkboxes in two columns, read across in the slides' own order. */
export function SlidesField({
  value,
  onChange,
}: {
  value: ReadonlySet<ReportSection>
  onChange: (next: ReadonlySet<ReportSection>) => void
}) {
  const toggle = (s: ReportSection) => {
    const next = new Set(value)
    if (next.has(s)) next.delete(s)
    else next.add(s)
    onChange(next)
  }
  return (
    <div role="group" aria-label="Slides" className="grid grid-cols-2 gap-x-4 gap-y-1.5">
      {REPORT_SECTIONS.map((s) => (
        <Checkbox key={s} label={SECTION_LABELS[s]} checked={value.has(s)} onChange={() => toggle(s)} />
      ))}
    </div>
  )
}

/** The checked slides in the order the report shows them, whatever order they were ticked in. */
export function orderedSections(value: ReadonlySet<ReportSection>): ReportSection[] {
  return REPORT_SECTIONS.filter((s) => value.has(s))
}

/** Whether a report's link still opens: not deleted, and not past its expiry. */
export function reportLinkOpen(report: Pick<Report, 'revoked_at' | 'expires_at'>, now: Date): boolean {
  if (report.revoked_at) return false
  return report.expires_at === null || new Date(report.expires_at).getTime() > now.getTime()
}

/** The dot chip beside a report: "Link open until 28 Oct", "Link open", "Link closed". */
export function ReportLinkChip({ report, timezone, now }: { report: Report; timezone: string; now: Date }) {
  if (!reportLinkOpen(report, now)) {
    return <StatusChip tone="neutral" dot>Link closed</StatusChip>
  }
  const currentYear = Number(new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric' }).format(now))
  return (
    <StatusChip tone="success" dot>
      {report.expires_at ? `Link open until ${siteDay(report.expires_at, timezone, currentYear)}` : 'Link open'}
    </StatusChip>
  )
}

export interface ReportsList {
  reports: Report[] | null
  schedules: ReportSchedule[] | null
  failed: boolean
  reload: () => Promise<void>
}

/**
 * The site's reports and schedules, read together. Null while the first answer
 * is on its way; `failed` when either read failed (never an empty list that
 * reads as "you have none").
 */
export function useReportsList(siteId: string): ReportsList {
  const [reports, setReports] = useState<Report[] | null>(null)
  const [schedules, setSchedules] = useState<ReportSchedule[] | null>(null)
  const [failed, setFailed] = useState(false)

  const reload = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([listReports(siteId), listSchedules(siteId)])
      setReports(r)
      setSchedules(s)
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [siteId])

  useEffect(() => {
    void reload()
  }, [reload])

  return { reports, schedules, failed, reload }
}
