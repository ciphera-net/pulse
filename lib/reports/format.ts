import type { ReportChange, ReportCompare, ReportPreset, ReportSection } from '@/lib/api/reports'
import { addDays, formatSpan, spanDays, type DateSpan } from '@/lib/view/view'
import { formatDuration } from '@/lib/utils/format'
import { safeTimeZone } from '@/lib/utils/siteTime'

// ---------------------------------------------------------------------------
// Words and numbers for reports (PULSE-133/134). Pure: no React, no clock of
// its own (every "now" is passed in as the SITE's wall clock), so the settings
// tab, the report page and its print route all say the same thing.
// ---------------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** Slide checkboxes, in the approved form's order (B-3): two columns, read across. */
export const SECTION_LABELS: Record<ReportSection, string> = {
  headline: 'Headline numbers',
  growth: 'Growth',
  sources: 'Where visitors come from',
  content: 'What they read, and where they are',
  devices: 'Devices',
  goals: 'Goals',
}

/** The approved form's default: every slide but Devices. */
export const DEFAULT_SECTIONS: readonly ReportSection[] = ['headline', 'growth', 'sources', 'content', 'goals']

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/**
 * The days a preset names, for the period picker's label only. `today` is the
 * SITE's calendar day. The server resolves the preset itself and the report
 * shows the server's range; this only lets the picker say which days it means.
 * A report is frozen, so the trailing presets end on the last COMPLETE day
 * (yesterday), as the approved shot reads ("Last 90 days (30 Jun – 27 Sep
 * 2026)" made on 28 Sep).
 */
export function presetSpan(preset: ReportPreset, today: string): DateSpan {
  const [y, m] = today.split('-').map(Number)
  const yesterday = addDays(today, -1)
  switch (preset) {
    case 'last_30_days':
      return { start: addDays(yesterday, -29), end: yesterday }
    case 'last_90_days':
      return { start: addDays(yesterday, -89), end: yesterday }
    case 'last_month': {
      const py = m === 1 ? y - 1 : y
      const pm = m === 1 ? 12 : m - 1
      return { start: ymd(py, pm, 1), end: ymd(py, pm, lastDayOfMonth(py, pm)) }
    }
    case 'last_quarter': {
      const q = Math.floor((m - 1) / 3)
      const qy = q === 0 ? y - 1 : y
      const qStart = q === 0 ? 10 : (q - 1) * 3 + 1
      return { start: ymd(qy, qStart, 1), end: ymd(qy, qStart + 2, lastDayOfMonth(qy, qStart + 2)) }
    }
    case 'year_to_date': {
      const start = ymd(y, 1, 1)
      // On 1 January the year so far is today alone.
      return { start, end: yesterday < start ? today : yesterday }
    }
  }
}

export const PRESET_LABELS: Record<ReportPreset, string> = {
  last_30_days: 'Last 30 days',
  last_90_days: 'Last 90 days',
  last_month: 'Last month',
  last_quarter: 'Last quarter',
  year_to_date: 'Year to date',
}

/** "30 Jun – 27 Sep 2026": always with the year, since a report is read long after it is made. */
export function spanLabel(from: string, to: string): string {
  return formatSpan({ start: from, end: to }, 0)
}

function isWholeMonth(from: string, to: string): boolean {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return fd === 1 && fy === ty && fm === tm && td === lastDayOfMonth(ty, tm)
}

function isWholeQuarter(from: string, to: string): boolean {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return fd === 1 && (fm - 1) % 3 === 0 && fy === ty && tm === fm + 2 && td === lastDayOfMonth(ty, tm)
}

/**
 * What a period is set against, as the end of a sentence: "the 90 days
 * before", "the month before", "the same days last year". Null when the
 * report compares with nothing.
 */
export function comparePhrase(from: string, to: string, compare: ReportCompare): string | null {
  if (compare === 'none') return null
  if (compare === 'year') return 'the same days last year'
  if (isWholeMonth(from, to)) return 'the month before'
  if (isWholeQuarter(from, to)) return 'the quarter before'
  const days = spanDays({ start: from, end: to })
  return days === 1 ? 'the day before' : `the ${days} days before`
}

/**
 * A change as its arrow and size: "↑ 38%", "↓ 2.2pp". The arrow is the number's direction.
 * Percentages round to whole numbers and points keep one decimal, as the dashboard's rail
 * shows them (RailDelta), so a report never reads more precise than the dashboard it came from.
 */
export function changeText(change: ReportChange): string {
  const arrow = change.value >= 0 ? '↑' : '↓'
  const size = Math.abs(change.value)
  const shown = change.unit === '%' ? String(Math.round(size)) : Number.isInteger(size) ? String(size) : size.toFixed(1)
  return `${arrow} ${shown}${change.unit}`
}

export function formatCount(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : Math.round(n).toLocaleString('en-US')
}

/**
 * A share as a percentage. The payload carries shares and rates as percentages
 * with one decimal (41.3 is 41%), as pulse-backend freezes them.
 */
export function formatShare(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return '—'
  if (pct > 0 && pct < 1) return '<1%'
  return `${Math.round(pct)}%`
}

export type HeadlineKey = 'visitors' | 'visits' | 'pageviews' | 'bounce_rate' | 'visit_duration'

export const HEADLINE_LABELS: Record<HeadlineKey, string> = {
  visitors: 'Unique visitors',
  visits: 'Visits',
  pageviews: 'Pageviews',
  bounce_rate: 'Bounce rate',
  visit_duration: 'Visit duration',
}

/** A headline value as the dashboard writes it. Null is an em dash, never 0. */
export function formatHeadline(key: HeadlineKey, value: number | null): string {
  if (value === null) return '—'
  if (key === 'bounce_rate') return `${Math.round(value)}%`
  if (key === 'visit_duration') return formatDuration(value)
  return formatCount(value)
}

/** Up is good for every headline number but bounce rate. */
export function changeIsGood(key: HeadlineKey | 'goal', change: ReportChange): boolean {
  return key === 'bounce_rate' ? change.value <= 0 : change.value >= 0
}

/** "2026-09" → "Sep". */
export function monthShort(month: string): string {
  return MONTHS[Number(month.slice(5, 7)) - 1] ?? month
}

/** "2026-09" → "September". */
export function monthLong(month: string): string {
  return MONTHS_LONG[Number(month.slice(5, 7)) - 1] ?? month
}

/** The growth slide's title: "Visitors are up 38% on the 90 days before". */
export function growthTitle(change: ReportChange | null, against: string | null): string {
  if (!change || !against) return 'Visitors per month'
  if (change.value === 0) return `Visitors held level on ${against}`
  const size = Math.abs(change.value)
  const shown = Number.isInteger(size) ? String(size) : size.toFixed(1)
  return `Visitors are ${change.value > 0 ? 'up' : 'down'} ${shown}${change.unit} on ${against}`
}

/**
 * The growth slide's second line: "Visitors per month, last 12 months.
 * September so far is up 9% on August." The second sentence needs the last two
 * months and the server's month-on-month change.
 */
export function growthSubtitle(
  months: { month: string; partial: boolean }[],
  monthChange: ReportChange | null,
): string {
  const lead = `Visitors per month, last ${months.length} months.`
  if (!monthChange || months.length < 2) return lead
  const last = months[months.length - 1]
  const prev = months[months.length - 2]
  const size = Math.abs(monthChange.value)
  const shown = Number.isInteger(size) ? String(size) : size.toFixed(1)
  const which = `${monthLong(last.month)}${last.partial ? ' so far' : ''}`
  const verb = monthChange.value === 0 ? 'is level with' : `is ${monthChange.value > 0 ? 'up' : 'down'} ${shown}${monthChange.unit} on`
  return `${lead} ${which} ${verb} ${monthLong(prev.month)}.`
}

/** Round-number axis steps (1, 2, 2.5, 5 × 10ⁿ), about four intervals, the top tick at or above the peak. */
export function axisTicks(peak: number): number[] {
  if (!(peak > 0)) return [0, 1, 2, 3, 4]
  const rough = peak / 4
  const mag = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((v) => v >= rough) ?? 10 * mag
  const top = Math.ceil(peak / step) * step
  const count = Math.round(top / step)
  return Array.from({ length: count + 1 }, (_, i) => Math.round(i * step * 1000) / 1000)
}

/** "8k", "2.5k", "1.2M", "400". */
export function tickLabel(n: number): string {
  if (n >= 1_000_000) return `${Number((n / 1_000_000).toFixed(1))}M`
  if (n >= 1000) return `${Number((n / 1000).toFixed(1))}k`
  return String(n)
}

function zoneParts(iso: string, tz: string): { y: number; m: number; d: number; hh: string; mm: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: safeTimeZone(tz),
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const hh = get('hour') === '24' ? '00' : get('hour')
  return { y: Number(get('year')), m: Number(get('month')), d: Number(get('day')), hh, mm: get('minute') }
}

/** An instant as a day in the site's zone: "28 Oct", or "28 Oct 2027" outside `currentYear`. */
export function siteDay(iso: string, tz: string, currentYear: number): string {
  const p = zoneParts(iso, tz)
  return p.y === currentYear ? `${p.d} ${MONTHS[p.m - 1]}` : `${p.d} ${MONTHS[p.m - 1]} ${p.y}`
}

/** An instant as a day and time in the site's zone: "28 Sep 2026, 14:02". */
export function siteDayTime(iso: string, tz: string): string {
  const p = zoneParts(iso, tz)
  return `${p.d} ${MONTHS[p.m - 1]} ${p.y}, ${p.hh}:${p.mm}`
}
