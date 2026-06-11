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
  { key: 'wtd', label: 'Week to date', group: 'To date', resolve: getThisWeekRange },
  { key: 'mtd', label: 'Month to date', group: 'To date', resolve: getThisMonthRange },
  { key: 'qtd', label: 'Quarter to date', group: 'To date', resolve: getQuarterToDateRange },
  { key: 'ytd', label: 'Year to date', group: 'To date', resolve: getThisYearRange },
]

export const PERIOD_GROUPS = ['Real-time', 'Relative', 'Previous', 'To date'] as const

export const PERIOD_TO_API: Record<string, string> = {
  'today': 'today',
  'yesterday': 'yesterday',
  '1h': '1h',
  '24h': '24h',
  '7': '7d',
  '30': '30d',
}

export function findPreset(key: string): PeriodPreset | undefined {
  return PERIOD_PRESETS.find(p => p.key === key)
}

export function getLabelForPeriod(key: string): string {
  return findPreset(key)?.label ?? 'Custom'
}
