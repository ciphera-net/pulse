import { formatSiteTime, shiftDayKey, zoneDayStartMs, zoneParts } from '@/lib/utils/siteTime'

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
 * The data floor of the Visitors page, as a calendar day. It MUST agree with
 * database.VisitorIdentityEpoch on the server (2026-08-26T11:17:46Z), and the header prints
 * it. The switcher does not read it: its floor is the server's data window for the `visitors`
 * surface (VisitorRangeFloor, the function the read path clamps with).
 *
 * Every row written before a site's switch to one-day identity has visitor_id NULL: rows
 * before 26-08-2026 never had one (the IP it derives from was never stored), and the ids
 * written from 26-08-2026 to each site's switch were nulled on 28-10-2026. Every day counts
 * visitors per day, so the page draws no boundary and names no date on which counting changed.
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

/** "26/08" — the field's gridline label, in the SITE's calendar. */
function formatSiteDayNumeric(at: number, siteTimezone: string): string {
  const p = zoneParts(new Date(at), siteTimezone)
  return `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}`
}
