import { formatSiteDay, formatSiteTime, shiftDayKey, zoneDayStartMs, zoneParts } from '@/lib/utils/siteTime'

// ─── The Visitors page's range facts ────────────────────────────────
//
// Visitors runs on the one view switcher like every other page (PULSE-20): the twelve
// shared rows, answered against its data window (GET /sites/:id/data-window, surface
// `visitors`, whose floor is the identity epoch below). Its own Live group — 30 min /
// 1 h / 6 h / 24 h rolling windows — was RETIRED on 25-09-2026 in the same change as the
// one view memory: while both existed, picking a live window here would have become the
// whole app's remembered view. The live view is now the dashboard's realtime MODE,
// entered from the orb beside the switcher (5 minutes, never remembered). The retired
// tokens stay in the URL grammar, so an old link opens as the day it names.

/**
 * The identity-rebuild cutover, as a calendar day.
 *
 * 🔴 It MUST agree with database.VisitorIdentityEpoch on the server
 * (2026-08-26T11:17:46Z). The header prints it ("Data begins 26 Aug 2026"). The
 * SWITCHER no longer reads it: its floor is the server's data window for the
 * `visitors` surface (VisitorRangeFloor — the same function the read path clamps
 * with), so the menu, the calendar and the API cannot disagree about where
 * history starts. Before that instant `visitor_id` is NULL forever (the IP it derives from was
 * never stored, so a backfill is impossible), reads fall back to a per-DAY key,
 * and a range reaching earlier would render per-day identities under per-month
 * labels.
 */
export const VISITORS_MIN_DATE = '2026-08-26'

/**
 * presenceTicks computes the presence field's x-domain and its gridline labels.
 *
 * Two shapes, because the field means two different things:
 *  - a DATE range gets week-ish gridlines labelled dd/MM;
 *  - a ROLLING window gets minute gridlines labelled HH:mm, because a live view
 *    whose axis is in days would put every dot in one column.
 *
 * The domain is derived from the SAME range object the fetch uses, so a dot can
 * never be positioned against a window the data did not come from.
 */
export function presenceTicks(
  dateRange: { start: string; end: string },
  rollingMinutes: number | null,
  siteTimezone: string,
): { from: number; to: number; ticks: { at: number; label: string }[] } {
  const now = Date.now()

  if (rollingMinutes != null) {
    const from = now - rollingMinutes * 60_000
    const ticks = Array.from({ length: 4 }, (_, i) => {
      const at = from + ((now - from) * i) / 3
      // The SITE's clock, like every other time on this surface. A live window is
      // the one case where the two zones' labels differ but their dots do not,
      // which makes a wrong label here especially quiet.
      return { at, label: formatSiteTime(at, siteTimezone) }
    })
    return { from, to: now, ticks }
  }

  // 🔴 THE DOMAIN IS THE SITE'S DAYS, NOT THE READER'S.
  //
  // `new Date('2026-08-26T00:00:00')` — no zone suffix — is midnight in the
  // BROWSER, but `start`/`end` are the days the SERVER resolved in the site's
  // timezone and queried with. A reader in Auckland was therefore positioning
  // Brussels dots against an axis 10 hours out of step with the window the rows
  // actually came from, and clamping the earliest of them onto the left edge.
  const from = zoneDayStartMs(dateRange.start, siteTimezone)
  // The end DAY is inclusive, so the domain runs to its final instant — a dot
  // for an event at 23:50 on the last day belongs inside the field, not past
  // its right edge.
  const to = zoneDayStartMs(shiftDayKey(dateRange.end, 1), siteTimezone) - 1_000
  const span = Math.max(1, to - from)
  const count = span > 21 * 86_400_000 ? 5 : 4
  const ticks = Array.from({ length: count }, (_, i) => {
    const at = from + (span * i) / (count - 1)
    return { at, label: formatSiteDayNumeric(at, siteTimezone) }
  })
  return { from, to, ticks }
}

/**
 * monthBoundaries finds every identity reset inside a window, in the SITE's zone.
 *
 * An identity is minted per site-local calendar MONTH, so the instant a month
 * begins is the instant every visitor before it became a different visitor. The
 * presence field's x axis is pure recency and cannot say that on its own — across
 * a straddle the same person is two dots with nothing between them (measured:
 * 322 of one site's 517 rows in a 30-day range were already-reset identities).
 *
 * Returns at most a couple of entries for any range this surface offers, and an
 * empty array for a rolling window, which never spans a month.
 */
export function monthBoundaries(
  from: number,
  to: number,
  siteTimezone: string,
): { at: number; label: string }[] {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return []
  const out: { at: number; label: string }[] = []
  // Walk months from the one containing `from`, using the zone's own parts so a
  // 31-day month, a leap February and a DST transition are all somebody else's
  // problem — zoneDayStartMs resolves the real midnight in two passes.
  const p = zoneParts(new Date(from), siteTimezone)
  let year = p.year
  let month = p.month
  for (let i = 0; i < 14; i++) {
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
    const key = `${year}-${String(month).padStart(2, '0')}-01`
    const at = zoneDayStartMs(key, siteTimezone)
    if (at > to) break
    if (at > from) {
      out.push({ at, label: `${formatSiteDay(at, siteTimezone)} · identities reset` })
    }
  }
  return out
}

/** "26/08" — the field's gridline label, in the SITE's calendar. */
function formatSiteDayNumeric(at: number, siteTimezone: string): string {
  const p = zoneParts(new Date(at), siteTimezone)
  return `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}`
}
