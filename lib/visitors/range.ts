import type { PeriodPreset } from '@/lib/constants/periods'
import type { Period } from '@/lib/hooks/periodUrl'
import { formatSiteTime, shiftDayKey, zoneDayStartMs, zoneParts } from '@/lib/utils/siteTime'
import {
  getLast30MinutesRange,
  getLast1HourRange,
  getLast6HoursRange,
  getLast24HoursRange,
} from '@/lib/utils/dateRanges'

// ─── The Visitors page's range declaration (D4 + D5) ────────────────
//
// One object per concern, all handed to useUrlDateRange, so the picker's MENU,
// the periods the hook will APPLY and the window the page FETCHES cannot drift
// apart. That drift is what the shared hook exists to prevent, and it is what
// the journeys page's bespoke useJourneyFilters reintroduced.

/**
 * The identity-rebuild cutover, as a calendar day.
 *
 * 🔴 It MUST agree with database.VisitorIdentityEpoch on the server
 * (2026-08-26T11:17:46Z). The server clamps regardless — this is the picker's
 * half, so a customer is never offered a day the API will silently narrow.
 * Before that instant `visitor_id` is NULL forever (the IP it derives from was
 * never stored, so a backfill is impossible), reads fall back to a per-DAY key,
 * and a range reaching earlier would render per-day identities under per-month
 * labels.
 */
export const VISITORS_MIN_DATE = '2026-08-26'

/**
 * The live windows (D5), declared as rolling MINUTES rather than as date spans.
 *
 * "The last 30 minutes" is not expressible as two YYYY-MM-DD strings without
 * losing the thing that makes it live, so the page sends `minutes=` and the
 * server resolves the instant. The keys are real URL periods, so a live view is
 * shareable and survives a refresh like every other preset.
 */
export const VISITORS_ROLLING_MINUTES: Partial<Record<Period, number>> = {
  '30m': 30,
  '1h': 60,
  '6h': 360,
  '24h': 1440,
}

export const VISITORS_PRESETS: { group: string; presets: PeriodPreset[] } = {
  group: 'Live',
  presets: [
    { key: '30m', label: 'Last 30 minutes', group: 'Live', resolve: getLast30MinutesRange },
    { key: '1h', label: 'Last 1 hour', group: 'Live', resolve: getLast1HourRange },
    { key: '6h', label: 'Last 6 hours', group: 'Live', resolve: getLast6HoursRange },
    { key: '24h', label: 'Last 24 hours', group: 'Live', resolve: getLast24HoursRange },
  ],
}

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
