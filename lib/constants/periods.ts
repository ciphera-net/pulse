import {
  getLast1HourRange,
  getLast24HoursRange,
  getYesterdayRange,
  getThisWeekRange,
  getThisMonthRange,
  getThisYearRange,
  getLastWeekRange,
  getLastMonthRange,
  getLastQuarterRange,
  getLastYearRange,
  getQuarterToDateRange,
} from '@/lib/utils/dateRanges'
import { getDateRange } from '@/lib/utils/format'

export interface PeriodPreset {
  key: string
  label: string
  group: string
  resolve: () => { start: string; end: string }
}

function todayRange() {
  const d = new Date()
  const s = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  return { start: s, end: s }
}

export const PERIOD_PRESETS: PeriodPreset[] = [
  { key: '1h', label: 'Last 1 hour', group: 'Real-time', resolve: getLast1HourRange },
  { key: '24h', label: 'Last 24 hours', group: 'Real-time', resolve: getLast24HoursRange },
  { key: 'today', label: 'Today', group: 'Relative', resolve: todayRange },
  { key: 'yesterday', label: 'Yesterday', group: 'Relative', resolve: getYesterdayRange },
  { key: '7', label: 'Last 7 days', group: 'Relative', resolve: () => getDateRange(7) },
  { key: '30', label: 'Last 30 days', group: 'Relative', resolve: () => getDateRange(30) },
  { key: 'last-week', label: 'Last week', group: 'Previous', resolve: getLastWeekRange },
  { key: 'last-month', label: 'Last month', group: 'Previous', resolve: getLastMonthRange },
  { key: 'last-quarter', label: 'Last quarter', group: 'Previous', resolve: getLastQuarterRange },
  { key: 'last-year', label: 'Last year', group: 'Previous', resolve: getLastYearRange },
  // The to-date keys ARE the URL grammar's calendar periods (week/month/year)
  // — one vocabulary, so every preset round-trips through ?period= and keeps
  // its label. qtd joined the grammar in the same change.
  { key: 'week', label: 'Week to date', group: 'To date', resolve: getThisWeekRange },
  { key: 'month', label: 'Month to date', group: 'To date', resolve: getThisMonthRange },
  { key: 'qtd', label: 'Quarter to date', group: 'To date', resolve: getQuarterToDateRange },
  { key: 'year', label: 'Year to date', group: 'To date', resolve: getThisYearRange },
]

export const PERIOD_GROUPS = ['Real-time', 'Relative', 'Previous', 'To date'] as const

// Whether a period's LAST bucket is still accumulating (the range ends "now"
// by the token's own definition). This is SEMANTICS, not date math — the
// client never compares clocks (the server owns timezone resolution); a
// custom range is deliberately absent and therefore never flagged. Drives the
// chart's dashed today-tail (sharp-chart round, 01-09-2026).
export const PERIOD_ENDS_NOW: Record<string, boolean> = {
  '1h': true,
  '24h': true,
  'today': true,
  '7': true,
  '30': true,
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

// URL-grammar period keys the SERVER can resolve itself (ResolvePeriod, in the
// site's timezone). Keys absent here fall back to client-computed
// start_date/end_date. week/month/year arrive via shared URLs from sibling
// pages; resolving them server-side keeps "this month" the SITE's month.
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
}

// * Preset keys the funnels instrument cannot honestly serve: its API is
// * date-granular, so "Last hour"/"Last 24 hours" would silently mean
// * "today". One constant for the list AND detail page — both declare it to
// * useUrlDateRange, which returns it as pickerProps so menu and validation
// * cannot drift.
export const FUNNEL_EXCLUDED_PRESETS: string[] = ['1h', '24h']

export function findPreset(key: string): PeriodPreset | undefined {
  return PERIOD_PRESETS.find(p => p.key === key)
}

export function getLabelForPeriod(key: string): string {
  return findPreset(key)?.label ?? 'Custom'
}
