'use client'

import type { UptimeIncident } from '@/lib/api/uptime'
import {
  incidentDurationSeconds,
  totalDowntimeSeconds,
  fmtDurationSeconds,
  rangeWindowMs,
  UPTIME_NEG,
} from './uptimeMetrics'

// ---------------------------------------------------------------------------
// The incident ledger — episodes the checker confirmed, newest first. An
// ongoing episode carries the neg accent edge and a live duration. The cause
// column is the first confirmed check's error verbatim (machine data → mono).
// Times are UTC, matching the panel's bucket convention. Row durations are
// the episodes' FULL durations (the episode is a fact); the footer total is
// clipped to the range, because that is what the range gets charged.
// ---------------------------------------------------------------------------

// * Matches the fetch limit (the API's maximum). If a range genuinely holds
// * this many episodes, the footer says the list is a prefix instead of
// * presenting the count as complete.
export const INCIDENTS_FETCH_LIMIT = 200

function startedLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay =
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate()
  const hm = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
  if (sameDay) return `Today, ${hm}`
  const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return `${day}, ${hm}`
}

function causeText(i: UptimeIncident): string | null {
  if (i.first_error_message) return i.first_error_message
  if (i.first_status_code != null) return `status ${i.first_status_code}`
  return null
}

interface IncidentsTableProps {
  incidents: UptimeIncident[] | undefined
  error?: boolean
  dateRange: { start: string; end: string }
}

export default function IncidentsTable({ incidents, error, dateRange }: IncidentsTableProps) {
  const { startMs, endMs } = rangeWindowMs(dateRange)

  let body: React.ReactNode
  if (error && incidents === undefined) {
    body = <div className="px-4 py-6 text-sm text-neutral-500">Couldn&apos;t load incidents — retrying.</div>
  } else if (incidents === undefined) {
    body = <div className="px-4 py-6 text-sm text-neutral-500">Loading incidents…</div>
  } else if (incidents.length === 0) {
    body = <div className="px-4 py-6 text-sm text-neutral-500">No incidents in this range.</div>
  } else {
    const rows = incidents
    const downtime = totalDowntimeSeconds(rows, startMs, endMs)
    body = (
      <>
        <div className="flex h-8 items-center border-b border-border px-3 text-xs text-neutral-500">
          <span className="min-w-0 flex-1">Started</span>
          <div className="ml-3 flex shrink-0 items-center gap-3">
            <span className="w-16 text-right">Duration</span>
            <span className="hidden w-16 text-right sm:block">Failed</span>
            <span className="hidden w-72 text-right lg:block">Cause</span>
          </div>
        </div>
        {rows.map((i) => {
          const ongoing = i.ended_at == null
          const cause = causeText(i)
          return (
            <div key={i.id} className="relative flex h-9 items-center border-b border-border px-3 text-sm last:border-b-0">
              {ongoing && <span aria-hidden="true" className="absolute bottom-0 left-0 top-0 w-[2px]" style={{ background: UPTIME_NEG }} />}
              <span className="min-w-0 flex-1 truncate text-white">
                {startedLabel(i.started_at)}
                {ongoing && (
                  <span className="ml-2" style={{ color: UPTIME_NEG }}>
                    · ongoing
                  </span>
                )}
                {!ongoing && i.status === 'degraded' && <span className="ml-2 text-xs text-neutral-500">degraded</span>}
              </span>
              <div className="ml-3 flex shrink-0 items-center gap-3 tabular-nums">
                <span className="w-16 text-right text-white">{fmtDurationSeconds(incidentDurationSeconds(i))}</span>
                <span className="hidden w-16 text-right text-neutral-400 sm:block">
                  {i.failed_checks > 0 ? `${i.failed_checks}` : '—'}
                </span>
                <span className="hidden w-72 truncate text-right font-mono text-xs text-neutral-400 lg:block">
                  {cause ?? '—'}
                </span>
              </div>
            </div>
          )
        })}
        <div className="px-3 py-2.5 text-xs text-neutral-500">
          {rows.length >= INCIDENTS_FETCH_LIMIT
            ? `showing the ${INCIDENTS_FETCH_LIMIT} most recent incidents`
            : `${rows.length} incident${rows.length === 1 ? '' : 's'} in this range`}
          {' · '}
          {fmtDurationSeconds(downtime)} downtime in this range
        </div>
      </>
    )
  }

  return (
    <div className="rounded-none border border-border bg-card">
      <div className="flex h-10 items-center justify-between border-b border-border px-4">
        <span className="text-sm font-medium text-white">Incidents</span>
        <span className="hidden text-xs text-neutral-500 sm:block">
          confirmed status changes · times are UTC
        </span>
      </div>
      {body}
    </div>
  )
}
