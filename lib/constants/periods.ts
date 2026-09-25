import {
  getYesterdayRange,
  getThisMonthRange,
  getThisYearRange,
  getLastMonthRange,
  getLastYearRange,
} from '@/lib/utils/dateRanges'
import { getDateRange, formatDate } from '@/lib/utils/format'

// ─── The view switcher's twelve rows (owner decision 25-09-2026, PULSE-20) ───
//
// ONE list, identical on every authed page, no group headers, never scrolls:
//
//   Today · Yesterday · Last 7 days · Last 30 days · Last 3 months · Last 12 months · All time
//   ──────
//   This month · Last month · This year · Last year
//   ──────
//   Custom range…
//
// Pages no longer declare vocabularies (extraPresets / exclusive / excludePresets /
// presetsOnly are gone). A page declares its DATA WINDOW instead, and a row whose range
// has no data there is greyed with its reason (lib/view/view.ts) — never hidden, so the
// menu is one menu, the same length everywhere. Record:
// Pulse/docs/plans/22-09-2026-unified-time-range-design.md §12.
//
// Every token the menu used to offer (1h, 24h, 28, 6m, 16m, week, qtd, last-week,
// last-quarter, 30m, 6h) stays in the URL grammar (lib/hooks/periodUrl.ts), so an old
// link still opens — the trigger then shows the link's DATES, never the word "Custom".

/**
 * What kind of span a row names. It decides the closest view when the row has no data
 * on a page (the most recent span of the SAME kind and length that does — §11.15), and
 * it is the one thing the menu knows about a row beyond its label.
 */
export type ViewKind = 'day' | 'trailing' | 'month' | 'year' | 'all'

export interface PeriodPreset {
  key: string
  label: string
  /** The divider-separated block of the menu the row sits in. */
  section: 'relative' | 'calendar'
  kind: ViewKind
  /**
   * The row's range on `now` — which must be the page's wall clock (the site's; UTC on
   * CDN), never the browser's. "All time" resolves to TODAY here: that is the honest
   * answer only for a page with no data window (a new site). Wherever a window exists,
   * the switcher resolves All time from it, and the server resolves the fetch
   * (period=all) — the client never computes a site's history.
   */
  resolve: (now?: Date) => { start: string; end: string }
}

function todayRange(now: Date = new Date()) {
  const s = formatDate(now)
  return { start: s, end: s }
}

export const PERIOD_PRESETS: readonly PeriodPreset[] = [
  { key: 'today', label: 'Today', section: 'relative', kind: 'day', resolve: todayRange },
  { key: 'yesterday', label: 'Yesterday', section: 'relative', kind: 'day', resolve: getYesterdayRange },
  { key: '7', label: 'Last 7 days', section: 'relative', kind: 'trailing', resolve: (now) => getDateRange(7, now) },
  { key: '30', label: 'Last 30 days', section: 'relative', kind: 'trailing', resolve: (now) => getDateRange(30, now) },
  { key: '3m', label: 'Last 3 months', section: 'relative', kind: 'trailing', resolve: (now) => getDateRange(90, now) },
  { key: '12m', label: 'Last 12 months', section: 'relative', kind: 'trailing', resolve: (now) => getDateRange(365, now) },
  { key: 'all', label: 'All time', section: 'relative', kind: 'all', resolve: todayRange },
  { key: 'month', label: 'This month', section: 'calendar', kind: 'month', resolve: getThisMonthRange },
  { key: 'last-month', label: 'Last month', section: 'calendar', kind: 'month', resolve: getLastMonthRange },
  { key: 'year', label: 'This year', section: 'calendar', kind: 'year', resolve: getThisYearRange },
  { key: 'last-year', label: 'Last year', section: 'calendar', kind: 'year', resolve: getLastYearRange },
]

/** The last row, which swaps the list for the calendar. */
export const CUSTOM_RANGE_LABEL = 'Custom range…'

// Whether a period's LAST bucket is still accumulating (the range ends "now" by the
// token's own definition). This is SEMANTICS, not date math — the client never compares
// clocks (the server owns timezone resolution); a custom range is deliberately absent and
// therefore never flagged. Drives the chart's dashed today-tail (sharp-chart round,
// 01-09-2026). Legacy tokens keep their entries: an old link still draws correctly.
export const PERIOD_ENDS_NOW: Record<string, boolean> = {
  '1h': true,
  '24h': true,
  'today': true,
  '7': true,
  '28': true,
  '30': true,
  '3m': true,
  '6m': true,
  '12m': true,
  '16m': true,
  'all': true,
  'week': true,
  'month': true,
  'qtd': true,
  'year': true,
  'yesterday': false,
  'last-week': false,
  'last-month': false,
  'last-quarter': false,
  'last-year': false,
}

// URL-grammar period keys the SERVER can resolve itself (ResolvePeriod, in the site's
// timezone). Keys absent here fall back to client-computed start_date/end_date.
// week/month/year arrive via shared URLs from sibling pages; resolving them server-side
// keeps "this month" the SITE's month. `all` is resolved from the page's data window
// (pulse-backend memberRange) — and exempt from the 366-day cap, which is why it must
// travel as a token and never as the window's dates.
export const PERIOD_TO_API: Record<string, string> = {
  'today': 'today',
  'yesterday': 'yesterday',
  '1h': '1h',
  '24h': '24h',
  '7': '7d',
  '30': '30d',
  'week': 'week',
  'month': 'month',
  'year': 'year',
  'all': 'all',
}

export function findPreset(key: string): PeriodPreset | undefined {
  return PERIOD_PRESETS.find((p) => p.key === key)
}
