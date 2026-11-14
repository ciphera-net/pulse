import type { AnalystStep } from '@/lib/api/analyst'
import { formatMetricValue, metricBand } from '@/lib/performance/metrics'
import { formatDuration, formatNumber } from '@/lib/utils/format'

/**
 * "Figures behind this answer": what each of the analyst's lookups shows a person. A comparison (compare_periods) is
 * drawn as rows, earlier period to later. Every other lookup is drawn the same way since the figures round (pick A,
 * 13-11-2026): a title and its dates, then a row per figure with a grey note beside it. A lookup with no figures to
 * show is one line naming what was read and for which dates. Pure, so the tests can feed it the shapes pulse-backend
 * returns.
 */

export interface StepRow {
  name: string
  before: number
  now: number
  /** Draw the referrer's logo beside the name (a comparison of sources). */
  logo: boolean
}

/** One row of figures: what it is, its figure, and a grey note beside it ("97.5% dropped off", "position 5.9"). */
export interface FigureRow {
  name: string
  value: string
  note: string
  /** A figure Pulse rates poor (a Core Web Vital past its poor line) or a monitor down now: an orange dot by the note. */
  mark: boolean
  /** Draw the referrer's logo beside the name (rows of sources). */
  logo: boolean
}

/** A block of figures, drawn as a comparison is: its title, its dates, its rows, then "and N more". */
export interface FigureBlock {
  title: string
  range: string | null
  rows: FigureRow[]
  more: number
}

export type StepView =
  | { kind: 'compare'; title: string; range: string | null; rows: StepRow[]; more: number }
  | { kind: 'figures'; blocks: FigureBlock[] }
  | { kind: 'line'; text: string; failed: boolean }

/** How many changed rows a comparison shows before "and N more". */
export const COMPARE_ROWS_SHOWN = 5

/** How many rows a block of figures shows before "and N more": as many as a comparison. */
export const FIGURE_ROWS_SHOWN = COMPARE_ROWS_SHOWN

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

/** What one row of an engagement lookup is, as its name says it: "Engagement by source". */
const ENGAGEMENT_ROWS: Record<string, string> = {
  page: 'page',
  referrer: 'source',
  channel: 'channel',
  country: 'country',
  utm_source: 'campaign source',
  utm_medium: 'campaign medium',
  utm_campaign: 'campaign',
}

function engagementBy(dimension: unknown): string {
  return typeof dimension === 'string' ? (ENGAGEMENT_ROWS[dimension] ?? dimension.replace(/_/g, ' ')) : 'row'
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

/** A filter as pulse-backend reads one (splitFilterExpr): "!=" is looked for first, then "==". */
interface Filter {
  dimension: string
  exclude: boolean
  value: string
}

function parseFilter(expr: string): Filter | null {
  for (const [token, exclude] of [['!=', true], ['==', false]] as const) {
    const i = expr.indexOf(token)
    if (i > 0) return { dimension: expr.slice(0, i).trim(), exclude, value: expr.slice(i + token.length).trim() }
  }
  return null
}

/** How long a filter's value may be in a lookup's name before it is cut (a page path can be long). */
const FILTER_VALUE_MAX = 48

const COUNTRY_NAMES = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' })
const LANGUAGE_NAMES = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' })

/** A filter's value as a person reads it: a country's or a language's name for its code, the rest as written. */
function filterValue(f: Filter): string {
  try {
    if (f.dimension === 'country' && /^[A-Za-z]{2}$/.test(f.value)) {
      return COUNTRY_NAMES.of(f.value.toUpperCase()) ?? f.value
    }
    if (f.dimension === 'language' && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(f.value)) {
      return LANGUAGE_NAMES.of(f.value) ?? f.value
    }
  } catch {
    // * A code Intl does not accept is shown as written.
  }
  return f.value.length > FILTER_VALUE_MAX ? `${f.value.slice(0, FILTER_VALUE_MAX - 1)}…` : f.value
}

/**
 * The filters a lookup was narrowed to (round 7, ruled 11-11-2026): the ones the server says it applied (each result
 * echoes them, cleaned) once there is a result, else the ones the model asked for.
 */
function filtersOf(args: Record<string, unknown>, result: Record<string, unknown>): string[] {
  for (const list of [result.filters, obj(result.current).filters, args.filters]) {
    if (Array.isArray(list)) return list.filter((f): f is string => typeof f === 'string')
  }
  return []
}

/**
 * What a lookup was narrowed to, as the words after its name: " for google.com", " for Germany and mobile",
 * " excluding Direct". Values of one dimension are either-or, as the server reads them; dimensions add up.
 */
export function narrowedTo(filters: readonly string[]): string {
  const include = new Map<string, string[]>()
  const exclude: string[] = []
  for (const expr of filters) {
    const f = parseFilter(expr)
    if (!f || f.value === '') continue
    if (f.exclude) {
      exclude.push(filterValue(f))
      continue
    }
    include.set(f.dimension, [...(include.get(f.dimension) ?? []), filterValue(f)])
  }
  const parts: string[] = []
  if (include.size > 0) parts.push(`for ${[...include.values()].map((values) => values.join(' or ')).join(' and ')}`)
  if (exclude.length > 0) parts.push(`excluding ${exclude.join(' and ')}`)
  return parts.length > 0 ? ` ${parts.join(', ')}` : ''
}

/** The tools that take filters; a filter written to another one is ignored by the server, so it is not named. */
const FILTERED_TOOLS = new Set([
  'get_stats',
  'get_breakdown',
  'compare_periods',
  'get_daily_series',
  'get_engagement',
  'get_goals',
  'get_funnels',
  'get_journeys',
  'get_hours',
])

function narrowing(tool: string, args: Record<string, unknown>, result: Record<string, unknown> = {}): string {
  return FILTERED_TOOLS.has(tool) ? narrowedTo(filtersOf(args, result)) : ''
}

function titleOf(dimension: unknown): string {
  if (typeof dimension !== 'string' || dimension === '') return 'Visitors and pageviews'
  return DIMENSION_TITLES[dimension] ?? dimension.replace(/_/g, ' ')
}

function withRange(text: string, result: Record<string, unknown>): string {
  const range = asRange(result.range)
  return range ? `${text}, ${formatRange(range)}` : text
}

function describeCompare(result: Record<string, unknown>, args: Record<string, unknown>): StepView {
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
    return { kind: 'compare', title: titleOf('') + narrowing('compare_periods', args, result), range, rows, more: 0 }
  }

  const all = Array.isArray(result.rows) ? result.rows.map(obj) : []
  const rows: StepRow[] = []
  for (const r of all.slice(0, COMPARE_ROWS_SHOWN)) {
    const b = num(r.previous_visitors)
    const n = num(r.current_visitors)
    if (typeof r.value !== 'string' || b === null || n === null) continue
    rows.push({ name: r.value === '' ? '(none)' : r.value, before: b, now: n, logo: dimension === 'referrer' })
  }
  return {
    kind: 'compare',
    title: titleOf(dimension) + narrowing('compare_periods', args, result),
    range,
    rows,
    more: Math.max(0, all.length - COMPARE_ROWS_SHOWN),
  }
}

/** What one lookup shows. A lookup that failed says so, so a missing figure is never silent. */
export function describeStep(step: AnalystStep): StepView {
  const result = obj(step.result)
  const args = obj(step.args)
  if (step.error) return { kind: 'line', text: failedLookup(step.tool, args) + narrowing(step.tool, args), failed: true }
  if (step.tool === 'compare_periods') return describeCompare(result, args)
  const blocks = figureBlocks(step.tool, result, args)
  if (blocks.length > 0) return { kind: 'figures', blocks }
  return { kind: 'line', text: lookupLine(step.tool, args, result), failed: false }
}

/** A lookup as one line: its name, what it was narrowed to and its dates ("Funnels, 14 October to 12 November"). */
function lookupLine(tool: string, args: Record<string, unknown>, result: Record<string, unknown>): string {
  return withRange(lookupName(tool, { ...args, ...result }) + narrowing(tool, args, result), result)
}

// ---------------------------------------------------------------------------------------------------------------
// * The figures of each lookup. Each builder reads only what the server returned and leaves out a figure it lacks
// * (an em dash never stands in for a missing row); no rows at all means the lookup stays one line.

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.map(obj) : [])

/** A rate as the dashboard prints one: 69.97 as "70%", 53.5 as "53.5%". */
function percent(n: number): string {
  return `${Number(n.toFixed(1))}%`
}

/** An average a day or an hour, one decimal at most ("12.5", "5"). */
function average(n: number): string {
  return String(Number(n.toFixed(1)))
}

/** "1 visit", "38 visits". */
function counted(n: number, one: string, many: string): string {
  return `${formatNumber(n)} ${n === 1 ? one : many}`
}

function figure(name: string, value: string, note = '', more: Partial<FigureRow> = {}): FigureRow {
  return { name, value, note, mark: false, logo: false, ...more }
}

/** Rows cut to what a block shows, and how many it left out. */
function shown(rows: FigureRow[]): { rows: FigureRow[]; more: number } {
  return { rows: rows.slice(0, FIGURE_ROWS_SHOWN), more: Math.max(0, rows.length - FIGURE_ROWS_SHOWN) }
}

function rangeText(result: Record<string, unknown>): string | null {
  const range = asRange(result.range)
  return range ? formatRange(range) : null
}

function oneDay(date: unknown): string | null {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? formatRange({ from: date, to: date }) : null
}

function figureBlocks(tool: string, result: Record<string, unknown>, args: Record<string, unknown>): FigureBlock[] {
  switch (tool) {
    case 'get_stats':
      return statsBlocks(result, args)
    case 'get_daily_series':
      return dailyBlocks(result, args)
    case 'get_breakdown':
      return breakdownBlocks(result, args)
    case 'get_realtime':
      return realtimeBlocks(result)
    case 'get_engagement':
      return engagementBlocks(result, args)
    case 'get_excluded_traffic':
      return excludedBlocks(result)
    case 'get_search':
      return searchBlocks(result)
    case 'get_goals':
      return goalsBlocks(result, args)
    case 'get_funnels':
      return funnelBlocks(result, args)
    case 'get_performance':
      return performanceBlocks(result)
    case 'get_uptime':
      return uptimeBlocks(result)
    case 'get_journeys':
      return journeyBlocks(result, args)
    case 'get_hours':
      return hourBlocks(result, args)
    case 'get_cdn':
      return cdnBlocks(result)
    default:
      return []
  }
}

function statsBlocks(result: Record<string, unknown>, args: Record<string, unknown>): FigureBlock[] {
  const rows: FigureRow[] = []
  const add = (name: string, value: number | null, show: (n: number) => string) => {
    if (value !== null) rows.push(figure(name, show(value)))
  }
  add('Visitors', num(result.visitors), formatNumber)
  add('Pageviews', num(result.pageviews), formatNumber)
  add('Bounce rate', num(result.bounce_rate), percent)
  add('Visit duration', num(result.avg_duration), formatDuration)
  add('Scroll depth', num(result.avg_scroll_depth), percent)
  if (rows.length === 0) return []
  return [{ title: 'Totals' + narrowing('get_stats', args, result), range: rangeText(result), rows, more: 0 }]
}

/** The day series by its own counts (the server's summary): the busiest and quietest days, and the empty ones. */
function dailyBlocks(result: Record<string, unknown>, args: Record<string, unknown>): FigureBlock[] {
  const summary = obj(result.summary)
  const rows: FigureRow[] = []
  const day = (label: string, d: Record<string, unknown>) => {
    const date = oneDay(d.date)
    const visitors = num(d.visitors)
    if (!date || visitors === null) return
    const ties = num(d.days_with_that_many) ?? 1
    rows.push(figure(label, ties > 1 ? `${date} and ${ties - 1} more` : date, counted(visitors, 'visitor', 'visitors')))
  }
  day('Busiest day', obj(summary.busiest_day))
  const quietest = obj(summary.quietest_day)
  // * A quietest day with no visitors is the empty days' row below, said once.
  if ((num(quietest.visitors) ?? 0) > 0) day('Quietest day', quietest)
  const whole = num(summary.whole_days)
  const empty = num(summary.days_without_visitors)
  if (whole !== null && empty !== null) rows.push(figure('Whole days without visitors', `${formatNumber(empty)} of ${formatNumber(whole)}`))
  if (rows.length === 0) return []
  return [{ title: 'Day by day' + narrowing('get_daily_series', args, result), range: rangeText(result), rows, more: 0 }]
}

function breakdownBlocks(result: Record<string, unknown>, args: Record<string, unknown>): FigureBlock[] {
  const dimension = str(result.dimension) ?? str(args.dimension) ?? ''
  const rows = list(result.rows).flatMap((r) => {
    const visitors = num(r.visitors)
    if (typeof r.value !== 'string' || visitors === null) return []
    const pageviews = num(r.pageviews)
    return [
      figure(r.value === '' ? '(none)' : r.value, formatNumber(visitors), pageviews === null ? '' : counted(pageviews, 'pageview', 'pageviews'), {
        logo: dimension === 'referrer',
      }),
    ]
  })
  if (rows.length === 0) return []
  return [{ title: titleOf(dimension) + narrowing('get_breakdown', args, result), range: rangeText(result), ...shown(rows) }]
}

function realtimeBlocks(result: Record<string, unknown>): FigureBlock[] {
  const now = num(result.visitors_now)
  if (now === null) return []
  const minutes = num(result.window_minutes)
  const rows = [figure('Visitors now', formatNumber(now), minutes ? `last ${minutes} minutes` : '')]
  for (const page of list(result.top_pages)) {
    const path = str(page.path) ?? str(page.value)
    const visitors = num(page.visitors)
    if (path && visitors !== null) rows.push(figure(path, formatNumber(visitors)))
  }
  return [{ title: 'Visitors right now', range: null, ...shown(rows) }]
}

/** Engagement: a page's time on page and entry bounce rate; any other row's visit duration and bounce rate. */
function engagementBlocks(result: Record<string, unknown>, args: Record<string, unknown>): FigureBlock[] {
  const dimension = str(result.dimension) ?? str(args.dimension) ?? ''
  const pages = dimension === 'page'
  const rows = list(result.rows).flatMap((r) => {
    if (typeof r.value !== 'string') return []
    const time = num(pages ? r.avg_time_on_page : r.avg_duration)
    const bounce = num(pages ? r.entry_bounce_rate : r.bounce_rate)
    if (time === null) return []
    return [
      figure(r.value === '' ? '(none)' : r.value, formatDuration(time), bounce === null ? '' : `${percent(bounce)} bounce`, {
        logo: dimension === 'referrer',
      }),
    ]
  })
  if (rows.length === 0) return []
  const title = `Engagement by ${engagementBy(dimension)}` + narrowing('get_engagement', args, result)
  return [{ title, range: rangeText(result), ...shown(rows) }]
}

/**
 * What each kind of traffic kept out is called in a row: every verdict family pulse-backend can return
 * (cerberus.VerdictFamily), named from what the server says was observed for it. A kind added there later is named by
 * its key until it is named here.
 */
const KEPT_OUT_KINDS: Record<string, string> = {
  population_statistic: 'Bot and spam patterns',
  declared_crawler: 'Declared crawlers',
  operator_decision: 'Excluded by hand',
  constructive: 'Made-up page addresses',
  self_reported: 'Known bot screen sizes',
  cross_tenant: 'Seen on unrelated sites',
  physical: 'Impossible for one person',
}

/**
 * The traffic kept out, by period as Settings shows it, then by kind in a block of its own: the kinds count every event
 * still kept, never the last 30 days (measured 12-11-2026: a model read them as the last 30 days).
 */
function excludedBlocks(result: Record<string, unknown>): FigureBlock[] {
  const periods: [string, string][] = [
    ['Last 24 hours', 'events_last_24_hours'],
    ['Last 7 days', 'events_last_7_days'],
    ['Last 30 days', 'events_last_30_days'],
    ['All time', 'events_all_kept'],
  ]
  const rows = periods.flatMap(([name, key]) => {
    const n = num(result[key])
    return n === null ? [] : [figure(name, counted(n, 'event', 'events'))]
  })
  // * `by_kind` is the key before pulse-backend#1305 named it for what it counts; it split everything kept then too.
  const kinds = list(result.all_kept_by_kind ?? result.by_kind).flatMap((k) => {
    const kind = str(k.kind)
    const n = num(k.events)
    return kind && n !== null ? [figure(KEPT_OUT_KINDS[kind] ?? kind.replace(/_/g, ' '), counted(n, 'event', 'events'))] : []
  })
  const blocks: FigureBlock[] = []
  if (rows.length > 0) blocks.push({ title: 'Traffic kept out of your stats', range: null, rows, more: 0 })
  if (kinds.length > 0) blocks.push({ title: 'Kept out, by kind', range: 'All time', rows: kinds, more: 0 })
  return blocks
}

/** Search: Google's totals, the searches that brought a click, then Bing's totals (Bing reports no searches). */
function searchBlocks(result: Record<string, unknown>): FigureBlock[] {
  const google = obj(result.google)
  const rows: FigureRow[] = []
  const position = (q: Record<string, unknown>) => {
    const p = num(q.position)
    return p === null ? '' : `position ${p}`
  }
  const totals = obj(google.current)
  const clicks = num(totals.clicks)
  if (clicks !== null) rows.push(figure('Google, all searches', counted(clicks, 'click', 'clicks'), position(totals)))
  const queries = list(google.top_queries).filter((q) => str(q.value) !== null && num(q.clicks) !== null)
  const clicked = queries.filter((q) => (num(q.clicks) ?? 0) > 0).slice(0, FIGURE_ROWS_SHOWN)
  for (const q of clicked) rows.push(figure(str(q.value) ?? '', counted(num(q.clicks) ?? 0, 'click', 'clicks'), position(q)))
  const bing = obj(result.bing)
  const bingClicks = num(obj(bing.current).clicks)
  const bingBefore = num(obj(bing.previous).clicks)
  if (bingClicks !== null) {
    rows.push(figure('Bing, all searches', counted(bingClicks, 'click', 'clicks'), bingBefore === null ? '' : `was ${formatNumber(bingBefore)}`))
  }
  if (rows.length === 0) return []
  return [{ title: 'Search figures', range: rangeText(result), rows, more: Math.max(0, queries.length - clicked.length) }]
}

function goalsBlocks(result: Record<string, unknown>, args: Record<string, unknown>): FigureBlock[] {
  if (!Array.isArray(result.events)) return []
  const title = 'Goals and events' + narrowing('get_goals', args, result)
  const rows = list(result.events).flatMap((e) => {
    const name = str(e.name) ?? str(e.event)
    const rate = num(e.conversion_rate)
    if (!name || rate === null) return []
    const visits = num(e.visits)
    return [figure(name, percent(rate), visits === null ? '' : counted(visits, 'visit', 'visits'))]
  })
  // * None at all is a finding ("LinkedIn recorded no events"), so it is said, not left as an empty block.
  if (rows.length === 0) return [{ title, range: rangeText(result), rows: [figure('Pulse recorded no goals or events', '')], more: 0 }]
  return [{ title, range: rangeText(result), ...shown(rows) }]
}

/** A funnel step by what it matches ("page /pricing" as "/pricing"), as the funnel was defined. */
function stepLabel(step: Record<string, unknown>): string {
  const match = str(step.match)
  return match ? match.replace(/^(page|event)\s+/, '') : (str(step.name) ?? 'Step')
}

/** One block a funnel: every step with its visitors, and the share of the step before that dropped off. */
function funnelBlocks(result: Record<string, unknown>, args: Record<string, unknown>): FigureBlock[] {
  const range = rangeText(result)
  const narrowed = narrowing('get_funnels', args, result)
  return list(result.funnels).flatMap((f) => {
    const name = str(f.name)
    const rows = list(f.steps).flatMap((step, i) => {
      const visitors = num(step.visitors)
      if (visitors === null) return []
      const drop = num(step.drop_off)
      return [figure(stepLabel(step), formatNumber(visitors), i === 0 || drop === null ? '' : `${percent(drop)} dropped off`)]
    })
    return name && rows.length > 0 ? [{ title: `${name} funnel${narrowed}`, range, rows, more: 0 }] : []
  })
}

/** The page a performance check measured, as a person names it: the homepage, or its path. */
function checkedPage(url: unknown): string | null {
  if (typeof url !== 'string' || url === '') return null
  try {
    const path = new URL(url).pathname
    return path === '/' || path === '' ? null : path
  } catch {
    return url
  }
}

const SPEED_METRICS: [string, string, string][] = [
  ['Largest Contentful Paint', 'lcp', 'largest_contentful_paint_ms'],
  ['Total Blocking Time', 'tbt', 'total_blocking_time_ms'],
  ['First Contentful Paint', 'fcp', 'first_contentful_paint_ms'],
  ['Cumulative Layout Shift', 'cls', 'cumulative_layout_shift'],
]

/**
 * One block a device: the performance score and four lab metrics, printed and rated as the Performance page prints
 * and rates them (lib/performance/metrics); a figure the page rates poor carries the orange dot and the word.
 */
function performanceBlocks(result: Record<string, unknown>): FigureBlock[] {
  const page = checkedPage(result.page)
  return list(result.checks).flatMap((check) => {
    // * A check without its device is titled without one: "on this device" would read as the reader's own.
    const device = str(check.device)
    const title = (page ? `Speed of ${page}` : 'Homepage speed') + (device ? ` on ${device}` : '')
    const range = oneDay(check.checked_on)
    if (check.status !== 'ok') return [{ title, range, rows: [figure('The check failed', '')], more: 0 }]
    const rows: FigureRow[] = []
    const score = num(check.performance_score)
    if (score !== null) rows.push(figure('Performance score', String(score), score < 50 ? 'poor' : '', { mark: score < 50 }))
    for (const [name, metric, key] of SPEED_METRICS) {
      const value = num(check[key])
      if (value === null) continue
      const poor = metricBand(metric, value) === 'poor'
      rows.push(figure(name, formatMetricValue(metric, value), poor ? 'poor' : '', { mark: poor }))
    }
    return rows.length > 0 ? [{ title, range, rows, more: 0 }] : []
  })
}

function uptimeBlocks(result: Record<string, unknown>): FigureBlock[] {
  const rows = list(result.monitors).flatMap((m) => {
    const name = str(m.name) ?? str(m.url)
    if (!name) return []
    const uptime = num(m.uptime)
    const down = m.status_now === 'down'
    const failed = num(m.failed_checks)
    const note = down ? 'down now' : failed === null ? '' : counted(failed, 'failed check', 'failed checks')
    return [figure(name, uptime === null ? 'no checks' : percent(uptime), note, { mark: down })]
  })
  if (rows.length === 0) return []
  if (Array.isArray(result.incidents)) rows.push(figure('Incidents', formatNumber(result.incidents.length)))
  return [{ title: 'Uptime', range: rangeText(result), rows, more: 0 }]
}

/** Journeys: the visits that went on to another page, then where they went next, each with its share. */
function journeyBlocks(result: Record<string, unknown>, args: Record<string, unknown>): FigureBlock[] {
  const entry = str(result.entry_page) ?? str(args.entry_page)
  const title = (entry ? `Journeys from ${entry}` : 'Journeys') + narrowing('get_journeys', args, result)
  // * `visits` is the key before pulse-backend#1305 named it for what it counts.
  const total = num(result.visits_of_two_pages_or_more) ?? num(result.visits)
  const first = list(result.steps)[0]
  const moves = (Array.isArray(first?.moves) ? first.moves : []).flatMap((m: unknown) => {
    if (!Array.isArray(m) || typeof m[1] !== 'string') return []
    const visits = num(m[2])
    if (visits === null) return []
    return [figure(m[1], formatNumber(visits), total ? percent((visits / total) * 100) : '')]
  })
  const rows: FigureRow[] = []
  if (total !== null) rows.push(figure('Went on to another page', counted(total, 'visit', 'visits')))
  rows.push(...moves.slice(0, FIGURE_ROWS_SHOWN))
  if (rows.length === 0) return []
  return [{ title, range: rangeText(result), rows, more: Math.max(0, moves.length - FIGURE_ROWS_SHOWN) }]
}

/**
 * Hours and weekdays: the average visitors a day of each weekday, then the three busiest hours by their average
 * visitors, under the dashboard card's own name (Peak hours).
 */
function hourBlocks(result: Record<string, unknown>, args: Record<string, unknown>): FigureBlock[] {
  const narrowed = narrowing('get_hours', args, result)
  const range = rangeText(result)
  const days = (Array.isArray(result.by_weekday) ? result.by_weekday : []).flatMap((d: unknown) => {
    if (!Array.isArray(d) || typeof d[0] !== 'string') return []
    const visitors = num(d[2])
    if (visitors === null) return []
    const pageviews = num(d[3])
    return [figure(d[0], average(visitors), pageviews === null ? '' : `${average(pageviews)} pageviews`)]
  })
  const hours = (Array.isArray(result.by_hour) ? result.by_hour : []).flatMap((h: unknown) => {
    if (!Array.isArray(h)) return []
    const hour = num(h[0])
    const visitors = num(h[1])
    return hour === null || visitors === null ? [] : [{ hour, visitors, pageviews: num(h[2]) }]
  })
  const busiest = [...hours].sort((a, b) => b.visitors - a.visitors || a.hour - b.hour).slice(0, 3)
  const blocks: FigureBlock[] = []
  if (days.length > 0) blocks.push({ title: `Visitors a day, by weekday${narrowed}`, range, rows: days, more: 0 })
  if (busiest.length > 0) {
    const rows = busiest.map((h) =>
      figure(`${String(h.hour).padStart(2, '0')}:00`, average(h.visitors), h.pageviews === null ? '' : `${average(h.pageviews)} pageviews`),
    )
    blocks.push({ title: `Peak hours, visitors an hour${narrowed}`, range, rows, more: 0 })
  }
  return blocks
}

/** The CDN's totals against the period before, as the server compared them. */
function cdnBlocks(result: Record<string, unknown>): FigureBlock[] {
  const current = obj(result.current)
  const previous = obj(result.previous)
  const cr = asRange(result.range)
  const pr = asRange(result.previous_range)
  const range = cr ? (pr ? `${formatRange(cr)} against ${formatRange(pr)}` : formatRange(cr)) : null
  const rows: FigureRow[] = []
  const add = (name: string, key: string, show: (n: number) => string) => {
    const now = num(current[key])
    if (now === null) return
    const before = num(previous[key])
    rows.push(figure(name, show(now), before === null ? '' : `was ${show(before)}`))
  }
  add('Requests', 'requests', formatNumber)
  add('Data served', 'data_mb', (n) => `${formatNumber(Math.round(n))} MB`)
  add('Cache hit rate', 'cache_hit_rate', percent)
  add('Errors', 'errors', formatNumber)
  add('Origin response', 'origin_response_ms', (n) => `${Math.round(n)}ms`)
  if (rows.length === 0) return []
  return [{ title: 'CDN figures', range, rows, more: 0 }]
}

/** How many characters of a web search's words a line shows before it cuts them. */
const WEB_QUERY_SHOWN = 60

/**
 * A web search's words as a line quotes them (plan §4c): the query the model wrote, on one line, cut to 60 characters;
 * null when it wrote none.
 */
function webQuery(args: Record<string, unknown>): string | null {
  const q = str(args.query)?.split(/\s+/).filter(Boolean).join(' ')
  if (!q) return null
  const chars = [...q]
  return chars.length > WEB_QUERY_SHOWN ? `${chars.slice(0, WEB_QUERY_SHOWN).join('').trimEnd()}…` : q
}

/** A lookup that failed, as a sentence that names what is missing. */
function failedLookup(tool: string, args: Record<string, unknown>): string {
  switch (tool) {
    case 'search_web':
      return 'Analyst could not search the web'
    case 'get_stats':
      return 'Analyst could not read the totals'
    case 'get_daily_series':
      return "Analyst could not read each day's figures"
    case 'get_breakdown':
      return `Analyst could not read the ${titleOf(args.dimension).toLowerCase()}`
    case 'get_engagement':
      return `Analyst could not read engagement by ${engagementBy(args.dimension)}`
    case 'get_excluded_traffic':
      return 'Analyst could not read the traffic Pulse kept out'
    case 'get_search':
      return 'Analyst could not read the search figures'
    case 'get_goals':
      return 'Analyst could not read the goals and events'
    case 'get_funnels':
      return 'Analyst could not read the funnels'
    case 'get_performance':
      return 'Analyst could not read the performance checks'
    case 'get_uptime':
      return 'Analyst could not read the uptime checks'
    case 'get_journeys':
      return 'Analyst could not read the journeys'
    case 'get_hours':
      return 'Analyst could not read when visitors come'
    case 'get_cdn':
      return 'Analyst could not read the CDN figures'
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
    case 'search_web': {
      const q = webQuery(args)
      return q ? `Web results for "${q}"` : 'Web results'
    }
    case 'get_stats':
      return 'Totals'
    case 'get_daily_series':
      return 'Day by day'
    case 'get_breakdown':
      return titleOf(args.dimension)
    case 'get_realtime':
      return 'Visitors right now'
    case 'get_engagement':
      return `Engagement by ${engagementBy(args.dimension)}`
    case 'get_excluded_traffic':
      return 'Traffic kept out of your stats'
    case 'get_search':
      return 'Search figures'
    case 'get_goals':
      return 'Goals and events'
    case 'get_funnels':
      return 'Funnels'
    case 'get_performance':
      return 'Performance checks'
    case 'get_uptime':
      return 'Uptime'
    case 'get_journeys':
      return typeof args.entry_page === 'string' && args.entry_page !== '' ? `Journeys from ${args.entry_page}` : 'Journeys'
    case 'get_hours':
      return 'Hours and weekdays'
    case 'get_cdn':
      return 'CDN figures'
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
  const narrowed = narrowing(tool, a)
  switch (tool) {
    case 'search_web': {
      const q = webQuery(a)
      return q ? `Searching the web for "${q}"` : 'Searching the web'
    }
    case 'compare_periods':
      return `Comparing ${titleOf(a.dimension).toLowerCase()}${narrowed} with ${periodBefore(a)}`
    case 'get_stats':
      return `Reading the totals${narrowed}`
    case 'get_daily_series':
      return `Reading each day's figures${narrowed}`
    case 'get_breakdown':
      return `Reading the ${titleOf(a.dimension).toLowerCase()}${narrowed}`
    case 'get_engagement':
      return `Reading engagement by ${engagementBy(a.dimension)}${narrowed}`
    case 'get_excluded_traffic':
      return 'Reading the traffic Pulse kept out'
    case 'get_search':
      return 'Reading the search figures'
    case 'get_goals':
      return `Reading the goals and events${narrowed}`
    case 'get_funnels':
      return `Reading the funnels${narrowed}`
    case 'get_performance':
      return 'Reading the performance checks'
    case 'get_uptime':
      return 'Reading the uptime checks'
    case 'get_journeys':
      return `Reading the journeys${typeof a.entry_page === 'string' && a.entry_page !== '' ? ` from ${a.entry_page}` : ''}${narrowed}`
    case 'get_hours':
      return `Reading when visitors come${narrowed}`
    case 'get_cdn':
      return 'Reading the CDN figures'
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
  if (view.kind === 'compare') return { text: view.range ? `${view.title}, ${view.range}` : view.title, failed: false }
  return { text: lookupLine(step.tool, obj(step.args), obj(step.result)), failed: false }
}
