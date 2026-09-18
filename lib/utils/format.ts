/**
 * Number / machine-date / duration formatting — re-homed from the legacy shared UI lib.
 *
 * NOTE: `formatDate` here is the MACHINE format (YYYY-MM-DD, built from LOCAL date
 * parts) used to construct analytics API query ranges. It is NOT a display format
 * and must not be confused with `@/lib/utils/formatDate` (human display, DD/MM/YYYY).
 * Ported verbatim — the local-date-part behaviour is intentional (differs from a
 * UTC `toISOString()` near midnight in non-UTC timezones).
 */

/** Format numbers with commas (e.g. 1,234,567) */
export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num)
}

/** Format date to YYYY-MM-DD (uses local timezone) — machine/API format */
export function formatDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Get date range for last N days (inclusive of today) — machine/API format.
 *
 * `now` defaults to the browser's `new Date()` but every caller that knows a
 * SITE (which is every caller reachable from a date-ranged page) must pass
 * `siteWallClockNow(site.timezone)` instead, or "today" means the viewer's
 * calendar day, not the site's. `now` is cloned before any mutation, so the
 * same Date instance can be reused across many resolver calls in one render
 * without corrupting it.
 */
export function getDateRange(days: number, now: Date = new Date()): { start: string; end: string } {
  const end = now
  const start = new Date(now)
  start.setDate(start.getDate() - (days - 1))
  return {
    start: formatDate(start),
    end: formatDate(end),
  }
}

/** Format "updated X ago" for polling indicators (e.g. "Just now", "12 seconds ago") */
export function formatUpdatedAgo(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000)
  if (diff < 5) return 'Just now'
  if (diff < 60) return `${diff} seconds ago`
  if (diff < 120) return '1 minute ago'
  const minutes = Math.floor(diff / 60)
  return `${minutes} minutes ago`
}

/** Format duration in seconds to "1m 30s" or "30s" */
export function formatDuration(seconds: number): string {
  if (!seconds) return '0s'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

/** Coarse duration for funnel conversion times — "45s", "12m", "2h 5m". */
export function formatConvertTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}
