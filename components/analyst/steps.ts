import type { AnalystStep } from '@/lib/api/analyst'

/**
 * "Figures behind this answer": what each of the analyst's lookups shows a person. A comparison (compare_periods) is
 * drawn as rows, earlier period to later; every other lookup is one line naming what was read and for which dates.
 * Pure, so the tests can feed it the shapes pulse-backend returns.
 */

export interface StepRow {
  name: string
  before: number
  now: number
  /** Draw the referrer's logo beside the name (a comparison of sources). */
  logo: boolean
}

export type StepView =
  | { kind: 'compare'; title: string; range: string | null; rows: StepRow[]; more: number }
  | { kind: 'line'; text: string; failed: boolean }

/** How many changed rows a comparison shows before "and N more". */
export const COMPARE_ROWS_SHOWN = 5

const DIMENSION_TITLES: Record<string, string> = {
  page: 'Pages',
  entry_page: 'Entry pages',
  exit_page: 'Exit pages',
  referrer: 'Sources',
  channel: 'Channels',
  country: 'Countries',
  region: 'Regions',
  browser: 'Browsers',
  os: 'Operating systems',
  device: 'Devices',
  language: 'Languages',
  utm_source: 'Campaign sources',
  utm_medium: 'Campaign mediums',
  utm_campaign: 'Campaigns',
}

const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })
const DAY_ONLY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: 'UTC' })
const DAY_MONTH_YEAR = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

interface Range {
  from: string
  to: string
}

function asRange(v: unknown): Range | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  return typeof r.from === 'string' && typeof r.to === 'string' ? { from: r.from, to: r.to } : null
}

/**
 * "4 to 10 November", "28 October to 3 November", "30 December 2025 to 5 January 2026". The dates are the site's
 * calendar days as the server resolved them, so they are read and printed as calendar days (UTC), never shifted.
 */
export function formatRange(range: Range): string {
  const from = new Date(`${range.from}T00:00:00Z`)
  const to = new Date(`${range.to}T00:00:00Z`)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return `${range.from} to ${range.to}`
  if (range.from === range.to) return DAY_MONTH.format(from)
  if (from.getUTCFullYear() !== to.getUTCFullYear()) return `${DAY_MONTH_YEAR.format(from)} to ${DAY_MONTH_YEAR.format(to)}`
  if (from.getUTCMonth() === to.getUTCMonth()) return `${DAY_ONLY.format(from)} to ${DAY_MONTH.format(to)}`
  return `${DAY_MONTH.format(from)} to ${DAY_MONTH.format(to)}`
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})

function titleOf(dimension: unknown): string {
  if (typeof dimension !== 'string' || dimension === '') return 'Visitors and pageviews'
  return DIMENSION_TITLES[dimension] ?? dimension.replace(/_/g, ' ')
}

function withRange(text: string, result: Record<string, unknown>): string {
  const range = asRange(result.range)
  return range ? `${text}, ${formatRange(range)}` : text
}

function describeCompare(result: Record<string, unknown>): StepView {
  const current = obj(result.current)
  const previous = obj(result.previous)
  const cr = asRange(current.range)
  const pr = asRange(previous.range)
  const range = cr && pr ? `${formatRange(cr)} against ${formatRange(pr)}` : null
  const dimension = typeof result.dimension === 'string' ? result.dimension : ''

  if (dimension === '') {
    const rows: StepRow[] = []
    const totals: [string, unknown, unknown][] = [
      ['Visitors', previous.visitors, current.visitors],
      ['Pageviews', previous.pageviews, current.pageviews],
    ]
    for (const [name, before, now] of totals) {
      const b = num(before)
      const n = num(now)
      if (b !== null && n !== null) rows.push({ name, before: b, now: n, logo: false })
    }
    return { kind: 'compare', title: titleOf(''), range, rows, more: 0 }
  }

  const all = Array.isArray(result.rows) ? result.rows.map(obj) : []
  const rows: StepRow[] = []
  for (const r of all.slice(0, COMPARE_ROWS_SHOWN)) {
    const b = num(r.previous_visitors)
    const n = num(r.current_visitors)
    if (typeof r.value !== 'string' || b === null || n === null) continue
    rows.push({ name: r.value === '' ? '(none)' : r.value, before: b, now: n, logo: dimension === 'referrer' })
  }
  return { kind: 'compare', title: titleOf(dimension), range, rows, more: Math.max(0, all.length - COMPARE_ROWS_SHOWN) }
}

/** What one lookup shows. A lookup that failed says so, so a missing figure is never silent. */
export function describeStep(step: AnalystStep): StepView {
  const result = obj(step.result)
  const args = obj(step.args)
  if (step.error) return { kind: 'line', text: failedLookup(step.tool, args), failed: true }
  if (step.tool === 'compare_periods') return describeCompare(result)
  return { kind: 'line', text: withRange(lookupName(step.tool, { ...args, ...result }), result), failed: false }
}

/** A lookup that failed, as a sentence that names what is missing. */
function failedLookup(tool: string, args: Record<string, unknown>): string {
  switch (tool) {
    case 'get_stats':
      return 'Analyst could not read the totals'
    case 'get_daily_series':
      return 'Analyst could not read the figures for each day'
    case 'get_breakdown':
      return `Analyst could not read the ${titleOf(args.dimension).toLowerCase()}`
    case 'get_realtime':
      return 'Analyst could not read who is on the site right now'
    case 'compare_periods':
      return 'Analyst could not compare the two periods'
    default:
      return 'One of the lookups failed'
  }
}

function lookupName(tool: string, args: Record<string, unknown>): string {
  switch (tool) {
    case 'get_stats':
      return 'Totals'
    case 'get_daily_series':
      return 'Day by day'
    case 'get_breakdown':
      return titleOf(args.dimension)
    case 'get_realtime':
      return 'Visitors right now'
    default:
      return 'Another lookup'
  }
}

/** The period a comparison is made against, as the running lookup names it ("with the week before"). */
function periodBefore(args: Record<string, unknown>): string {
  if (typeof args.from === 'string' || typeof args.to === 'string') return 'the period before'
  switch (args.period) {
    case undefined:
    case '7d':
      return 'the week before'
    case '30d':
      return 'the 30 days before'
    case 'month':
      return 'last month'
    case 'year':
      return 'last year'
    default:
      return 'the period before'
  }
}

/** What a lookup is doing while it runs (live answers, round 6): named from its arguments, before any result. */
export function runningLookup(tool: string, args: Record<string, unknown> | null): string {
  const a = obj(args)
  switch (tool) {
    case 'compare_periods':
      return `Comparing ${titleOf(a.dimension).toLowerCase()} with ${periodBefore(a)}`
    case 'get_stats':
      return 'Reading the totals'
    case 'get_daily_series':
      return 'Reading the figures for each day'
    case 'get_breakdown':
      return `Reading the ${titleOf(a.dimension).toLowerCase()}`
    case 'get_realtime':
      return 'Reading who is on the site right now'
    default:
      return "Reading this site's figures"
  }
}

/** A finished lookup as one line of the live list: named as "Figures behind this answer" names it, with its dates. */
export function finishedLookup(step: AnalystStep): { text: string; failed: boolean } {
  const view = describeStep(step)
  if (view.kind === 'line') return { text: view.text, failed: view.failed }
  return { text: view.range ? `${view.title}, ${view.range}` : view.title, failed: false }
}
