// ─── Visitors formatting helpers ────────────────────────────────────
//
// Two rules run through all of these.
//
// 1. A value we do not have renders as an EM DASH, never as 0, never as an empty
//    string, never as "Unknown". A zero is a measurement; an em dash is the
//    absence of one, and the difference is the whole of D7.
//
// 2. 🔴 EVERY CALENDAR JUDGEMENT IS MADE IN THE SITE'S TIMEZONE, WHICH IS PASSED
//    IN. None of these functions may reach for the machine's own zone, because on
//    a dashboard that is the READER'S, and the server buckets this data in the
//    SITE'S.
//
//    That was the bug (audit §2.4). `formatLastSeen` decided "Yesterday" from
//    browser midnight; `formatShortDate` printed a browser-local date; the month
//    ribbon bucketed with `getDate()`. Measured on staging: one visitor, one
//    site, read as "First seen 28 Aug" from Auckland and "27 Aug" from Brussels.
//    Two colleagues comparing notes disagreed about when somebody arrived.
//
//    The zone now arrives on the wire beside the timestamps it applies to
//    (`site_timezone`, on all four visitors responses), so the data and the
//    calendar it must be read in can never be out of step.

import { formatSiteDay, formatSiteTime, zoneParts } from '@/lib/utils/siteTime'

export const EM_DASH = '—'

/**
 * The zone to use when the wire has not (yet) supplied one.
 *
 * 🔑 It is UTC — the server's own `sites.timezone` default and the substitution
 * the rest of the read path makes — and NEVER the viewer's zone. A response held
 * in an SWR cache from before this field existed is the realistic way to get
 * here; answering it with the reader's calendar would quietly restore the defect
 * for exactly the readers who had the page open when it shipped.
 */
export const SITE_TIMEZONE_FALLBACK = 'UTC'

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

// ─── The site-calendar primitives ───────────────────────────────────
//
// 🔑 THEY ARE `lib/utils/siteTime.ts`, NOT NEW ONES. That module is the house's
// answer to "what day is it, where the site is" — it came out of the 22-08-2026
// site-timezone alignment work and already backs uptime and the CDN page. It
// handles the two traps a fresh implementation walks into: `hour12: false`
// renders midnight as "24" in some engines (so it uses `hourCycle: 'h23'`), and
// a zone's offset at a UTC guess can differ from its offset at the real local
// midnight across a DST transition (so `zoneDayStartMs` resolves in two passes).

/**
 * calendarDay turns an instant into a comparable CALENDAR-day integer in a zone.
 *
 * Differences taken on it are exact days: it is built with Date.UTC from the
 * zone's own wall-clock parts, so a 23- or 25-hour DST day still counts as one.
 * Subtracting two instants and dividing by 86 400 000 does not have that
 * property, and "Yesterday" is precisely the boundary a DST day moves.
 */
function calendarDay(t: Date, timeZone: string): number | null {
  if (!Number.isFinite(t.getTime())) return null
  const p = zoneParts(t, timeZone)
  return Date.UTC(p.year, p.month - 1, p.day) / 86_400_000
}

// ─── The rendered dates ─────────────────────────────────────────────

/** "2m ago" / "3h ago" / "Yesterday" / "28 Aug", the last two in the SITE's calendar. */
export function formatLastSeen(iso: string, timeZone: string, now = Date.now()): string {
  const then = new Date(iso)
  const t = then.getTime()
  if (!Number.isFinite(t)) return EM_DASH

  // The relative arm is a duration, not a calendar judgement, so no zone applies
  // to it — "3h ago" is three hours ago wherever either party stands.
  const diff = Math.max(0, now - t)
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`

  const thenDay = calendarDay(then, timeZone)
  const todayDay = calendarDay(new Date(now), timeZone)
  if (thenDay !== null && todayDay !== null && todayDay - thenDay === 1) return 'Yesterday'
  return formatSiteDay(then, timeZone)
}

/** "Today 16:21" / "28 Aug 14:02" — the visits list's row label, in the SITE's calendar. */
export function formatVisitStart(iso: string, timeZone: string, now = Date.now()): string {
  const t = new Date(iso)
  if (!Number.isFinite(t.getTime())) return EM_DASH
  const time = formatSiteTime(t, timeZone)
  const thenDay = calendarDay(t, timeZone)
  const todayDay = calendarDay(new Date(now), timeZone)
  if (thenDay !== null && thenDay === todayDay) return `Today ${time}`
  return `${formatSiteDay(t, timeZone)} ${time}`
}

/** "12 Aug" — the first-seen line, in the SITE's calendar. */
export function formatShortDate(iso: string, timeZone: string): string {
  const t = new Date(iso)
  if (!Number.isFinite(t.getTime())) return EM_DASH
  return formatSiteDay(t, timeZone)
}

/**
 * visitorLocalTime renders the clock where the VISITOR is, from their
 * self-reported IANA zone.
 *
 * ⚠️ This is the ONE function here that is not about the site's calendar, and the
 * argument it takes is a different fact from every other `timeZone` on this
 * surface: `visitor.timezone` is an event signal the browser reported, whereas
 * `site_timezone` is the site's own setting. The wire spells them differently for
 * that reason.
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
