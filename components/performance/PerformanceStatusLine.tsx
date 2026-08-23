'use client'

import type { PerformanceAttempt, PerformanceCheck } from '@/lib/api/performance'
import { formatSiteStamp } from '@/lib/utils/siteTime'
import { TermInfoTip } from '@/components/dashboard/MetricInfoTip'

// ---------------------------------------------------------------------------
// Performance status line — the meta line under the page subtitle, in the same
// grammar and treatment as SyncStatusLine on the Search and CDN pages
// (text-xs neutral-500 when healthy, text-red-400 with an inline action when
// not).
//
// WHY IT EXISTS. A failed check used to be completely invisible: no row was
// written, so the page silently re-rendered the previous check's numbers under
// the current date. This line is the thing that makes a failure sayable — it
// reports the last ATTEMPT, while the gauges below show the last SUCCESS, and
// it says out loud when those are not the same check.
// ---------------------------------------------------------------------------

interface PerformanceStatusLineProps {
  /** The most recent attempt for the visible strategy, whatever its outcome. */
  attempt: PerformanceAttempt | null
  /** The check whose numbers are actually on screen. */
  displayed: PerformanceCheck | null
  /** From the site's config — when the next scheduled check is due. */
  nextCheckAt: string | null
  /** Rerun action, shown inline on the failure line. Omitted without permission. */
  onRunCheck?: () => void
  runInFlight?: boolean
  /**
   * The SITE's IANA timezone. Check stamps are instants and render in site
   * time, self-labelled with the zone abbreviation ("23:15 CEST") — never the
   * VIEWER's locale zone, which would make two people quote different stamps
   * for the same check (owner decision 22-08-2026, the site-timezone
   * alignment design; previously these stamps were pinned to UTC).
   */
  timezone: string | null
}

/**
 * "in 11h" / "in 24m" / "shortly".
 *
 * A duration between two instants, not a calendar computation — no timezone is
 * inferred anywhere, which is why this one is safe to do on the client while the
 * absolute stamp above self-labels its zone.
 */
export function formatCountdown(target: string, now: Date = new Date()): string | null {
  const ms = new Date(target).getTime() - now.getTime()
  if (Number.isNaN(ms)) return null
  if (ms <= 60_000) return 'shortly'
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `in ${minutes}m`
  const hours = Math.round(ms / 3_600_000)
  if (hours < 48) return `in ${hours}h`
  return `in ${Math.round(hours / 24)}d`
}

export function PerformanceStatusLine({
  attempt,
  displayed,
  nextCheckAt,
  onRunCheck,
  runInFlight,
  timezone,
}: PerformanceStatusLineProps) {
  // No attempt at all: monitoring is on but nothing has run yet. Say that
  // rather than rendering an empty line that reads like a loading failure.
  if (!attempt) {
    return (
      <p className="mt-1.5 text-xs text-neutral-500">
        First check queued — results appear within a few minutes.
      </p>
    )
  }

  if (attempt.status === 'error') {
    const cause = attempt.error?.trim()
    return (
      <p className="mt-1.5 text-xs text-red-400">
        <span className="inline-flex items-center gap-1">
          Check failed{cause ? ` — ${cause}` : ''}
          <TermInfoTip term="check_error_status" glyphSize={12} />
        </span>
        {displayed && (
          <>
            <span aria-hidden="true" className="mx-1.5 text-red-400/50">
              ·
            </span>
            showing the last successful run
          </>
        )}
        {onRunCheck && (
          <>
            <span aria-hidden="true" className="mx-1.5 text-red-400/50">
              ·
            </span>
            <button
              type="button"
              onClick={onRunCheck}
              disabled={runInFlight}
              className="text-red-300 underline-offset-2 transition-colors duration-fast ease-apple hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange disabled:cursor-not-allowed disabled:opacity-60"
            >
              {runInFlight ? 'Running…' : 'Run Check'}
            </button>
          </>
        )}
      </p>
    )
  }

  const countdown = nextCheckAt ? formatCountdown(nextCheckAt) : null
  return (
    <p className="mt-1.5 text-xs text-neutral-500">
      <span className="tabular-nums">Last checked {formatSiteStamp(attempt.checked_at, timezone)}</span>
      {countdown && (
        <>
          <span aria-hidden="true" className="mx-1.5 text-neutral-600">
            ·
          </span>
          <span className="tabular-nums">next check {countdown}</span>
        </>
      )}
    </p>
  )
}
