import type { PeriodPreset } from '@/lib/constants/periods'
import type { Period } from '@/lib/hooks/periodUrl'
import { getLast30MinutesRange } from '@/lib/utils/dateRanges'

// ─── The site dashboard's LIVE MODE declaration ──────────────────────────────
//
// Picking "Realtime" does not choose a window length the way every other preset
// does — it puts the whole page into a live mode: the chart redraws in minute
// buckets, the KPI rail and every block below describe the same rolling window,
// and a WebSocket tells the page to refetch as visitors arrive.
//
// It is declared here rather than added to the GLOBAL preset list because the
// `Period` grammar is shared with funnels, search, CDN and uptime, none of which
// can serve a live window — a global entry would appear in their pickers and
// silently resolve to something they cannot honour. `extraPresets` is the
// established page-scoped seam; the Visitors page already uses it for its own
// live group (lib/visitors/range.ts), and this follows that shape deliberately
// rather than inventing a second mechanism.

/**
 * The live window, in rolling MINUTES.
 *
 * 30 minutes is the span the chart draws, one bar per minute — long enough to
 * show a shape and short enough that every bucket is a real measurement rather
 * than a mostly-empty axis.
 *
 * ⚠️ It is NOT the same number as the "current visitors" count in the orb. That
 * is the tracker's own five-minute presence window (internal/realtime), which
 * answers "who is here now"; this answers "what happened in the last half hour".
 * Two different questions, deliberately two different spans — do not "fix" them
 * into agreement.
 */
export const DASHBOARD_REALTIME_MINUTES = 30

export const DASHBOARD_ROLLING_MINUTES: Partial<Record<Period, number>> = {
  realtime: DASHBOARD_REALTIME_MINUTES,
}

export const DASHBOARD_REALTIME_PRESETS: {
  group: string
  presets: PeriodPreset[]
} = {
  group: 'Live',
  presets: [
    {
      key: 'realtime',
      label: 'Realtime',
      group: 'Live',
      // resolve() still returns a concrete span so the picker can render a label
      // and any consumer that insists on dates has something true to read. The
      // FETCH does not use it — a live window is sent as `minutes=`, because
      // "the last 30 minutes" is not expressible as two dates without losing the
      // thing that makes it live.
      resolve: getLast30MinutesRange,
    },
  ],
}

/** True when the page is in live mode. One predicate, so no component invents its own. */
export function isRealtimePeriod(period: Period): boolean {
  return period === 'realtime'
}
