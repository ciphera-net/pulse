/**
 * Number / machine-date / duration formatting — re-homed from @ciphera-net/ui.
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

/** Get date range for last N days (inclusive of today) — machine/API format */
export function getDateRange(days: number): { start: string; end: string } {
  const end = new Date()
  const start = new Date()
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
