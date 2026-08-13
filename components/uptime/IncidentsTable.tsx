'use client'

import type { UptimeIncident } from '@/lib/api/uptime'
import {
  incidentDurationSeconds,
  humanizeCause,
  fmtDurationSeconds,
  UPTIME_NEG,
} from './uptimeMetrics'

// ---------------------------------------------------------------------------
// The incident ledger — episodes the checker confirmed, newest first. An
// ongoing episode carries the neg accent edge and a live duration. The cause
// is humanized ("Timed out after 30 s"); the verbatim error string and the
// confirmed-failed check count live on the row's tooltip — they are debugging
// detail, not what the range gets judged by. No footer: the Availability
// rail's sub-line already states the range's incident count and downtime
// (trim decision, 14-08). Times are UTC, stated once on the panel's axis row.
// ---------------------------------------------------------------------------

// * Matches the fetch limit (the API's maximum). If a range genuinely holds
// * this many episodes, the header says the list is a prefix instead of
// * presenting it as complete.
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

function rowTooltip(i: UptimeIncident): string {
  const parts = [`${i.failed_checks} failed check${i.failed_checks === 1 ? '' : 's'}`]
  if (i.first_error_message) parts.push(i.first_error_message)
  else if (i.first_status_code != null) parts.push(`status ${i.first_status_code}`)
  return parts.join(' — ')
}

interface IncidentsTableProps {
  incidents: UptimeIncident[] | undefined
  error?: boolean
  /** The monitor's timeout, so a timeout cause can say after how long. */
  timeoutSeconds?: number
}

export default function IncidentsTable({ incidents, error, timeoutSeconds }: IncidentsTableProps) {
  let body: React.ReactNode
  if (error && incidents === undefined) {
    body = <div className="px-4 py-6 text-sm text-neutral-500">Couldn&apos;t load incidents — retrying.</div>
  } else if (incidents === undefined) {
    body = <div className="px-4 py-6 text-sm text-neutral-500">Loading incidents…</div>
  } else if (incidents.length === 0) {
    body = <div className="px-4 py-6 text-sm text-neutral-500">No incidents in this range.</div>
  } else {
    body = (
      <>
        <div className="flex h-8 items-center border-b border-border px-3 text-xs text-neutral-500">
          <span className="min-w-0 flex-1">Started</span>
          <div className="ml-3 flex shrink-0 items-center gap-3">
            <span className="w-16 text-right">Duration</span>
            <span className="hidden w-56 text-right sm:block">Cause</span>
          </div>
        </div>
        {incidents.map((i) => {
          const ongoing = i.ended_at == null
          const cause = humanizeCause(i.first_error_message, i.first_status_code, timeoutSeconds)
          return (
            <div
              key={i.id}
              title={rowTooltip(i)}
              className="relative flex h-9 items-center border-b border-border px-3 text-sm last:border-b-0"
            >
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
              <div className="ml-3 flex shrink-0 items-center gap-3">
                <span className="w-16 text-right tabular-nums text-white">{fmtDurationSeconds(incidentDurationSeconds(i))}</span>
                <span className="hidden w-56 truncate text-right text-xs text-neutral-400 sm:block">{cause ?? '—'}</span>
              </div>
            </div>
          )
        })}
      </>
    )
  }

  const headerNote =
    incidents && incidents.length >= INCIDENTS_FETCH_LIMIT
      ? `${INCIDENTS_FETCH_LIMIT} most recent · confirmed status changes`
      : 'confirmed status changes'

  return (
    <div className="rounded-none border border-border bg-card">
      <div className="flex h-10 items-center justify-between border-b border-border px-4">
        <span className="text-sm font-medium text-white">Incidents</span>
        <span className="hidden text-xs text-neutral-500 sm:block">{headerNote}</span>
      </div>
      {body}
    </div>
  )
}
