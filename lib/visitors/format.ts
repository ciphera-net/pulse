// ─── Visitors formatting helpers ────────────────────────────────────
//
// One rule runs through all of these: a value we do not have renders as an EM
// DASH, never as 0, never as an empty string, never as "Unknown". A zero is a
// measurement; an em dash is the absence of one, and the difference is the
// whole of D7.

export const EM_DASH = '—'

const REGION_NAMES =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null

/**
 * countryName turns an alpha-2 into a readable name, falling back to the code.
 *
 * The fallback matters: GeoIP emits aggregate pseudo-codes (T1, A1, A2, O1, AP)
 * that are not countries. Intl throws or echoes on those, and echoing the code
 * is honest — we know the bucket, not the country.
 */
export function countryName(code?: string | null): string {
  if (!code) return EM_DASH
  try {
    return REGION_NAMES?.of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

/** Seconds → "3m 05s" / "58s". Null stays an em dash — never "0s". */
export function formatDuration(seconds?: number | null): string {
  if (seconds == null) return EM_DASH
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rest = s % 60
  if (m < 60) return `${m}m ${String(rest).padStart(2, '0')}s`
  const h = Math.floor(m / 60)
  return `${h}h ${String(m % 60).padStart(2, '0')}m`
}

/** "2m ago" / "3h ago" / "Yesterday" / "28 Aug". */
export function formatLastSeen(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return EM_DASH
  const diff = Math.max(0, now - t)
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`

  const then = new Date(t)
  const today = new Date(now)
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const yesterday = new Date(midnight.getTime() - 86_400_000)
  if (then >= yesterday && then < midnight) return 'Yesterday'
  return then.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** "Today 16:21" / "28 Aug 14:02" — the visits list's row label. */
export function formatVisitStart(iso: string, now = Date.now()): string {
  const t = new Date(iso)
  if (!Number.isFinite(t.getTime())) return EM_DASH
  const time = t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const today = new Date(now)
  const sameDay =
    t.getFullYear() === today.getFullYear() &&
    t.getMonth() === today.getMonth() &&
    t.getDate() === today.getDate()
  if (sameDay) return `Today ${time}`
  return `${t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${time}`
}

/** "12 Aug" — the first-seen line. */
export function formatShortDate(iso: string): string {
  const t = new Date(iso)
  if (!Number.isFinite(t.getTime())) return EM_DASH
  return t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/**
 * visitorLocalTime renders the clock where the VISITOR is, from their
 * self-reported IANA zone.
 *
 * Returns null (not the viewer's own clock) when there is no zone. Showing the
 * dashboard-reader's local time under a label that says "where they are" would
 * be a fabrication, and a confident one.
 */
export function visitorLocalTime(timezone?: string | null, now = Date.now()): string | null {
  if (!timezone) return null
  try {
    return new Date(now).toLocaleTimeString('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    // An unknown zone string is a client-reported value we could not honour.
    return null
  }
}

/**
 * daysUntilMonthReset counts the days left in the identity's month.
 *
 * Null when the month has already passed — a historical identity does not have
 * a reset "coming", it already reset, and the page says that instead.
 */
export function daysUntilMonthReset(month: string, now = Date.now()): number | null {
  const [y, m] = month.split('-').map(Number)
  if (!y || !m) return null
  const firstOfNext = new Date(y, m, 1).getTime()
  const diff = firstOfNext - now
  if (diff <= 0) return null
  return Math.max(1, Math.ceil(diff / 86_400_000))
}

/** "1 Sep" — the date this identity resets. */
export function monthResetDate(month: string): string {
  const [y, m] = month.split('-').map(Number)
  if (!y || !m) return EM_DASH
  return new Date(y, m, 1).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
