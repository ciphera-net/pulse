import { PERIOD_PRESETS, findPreset, type PeriodPreset } from '@/lib/constants/periods'
import { periodToDateRange, type Period } from '@/lib/hooks/periodUrl'
import { formatDate } from '@/lib/utils/format'

// ─── What the view switcher shows, as pure functions (PULSE-20, 25-09-2026) ──
//
// Everything the switcher decides — which rows are greyed and why, what the closed
// button says ("· since 26 Aug"), and the CLOSEST VIEW when the remembered view has no
// data on this page — is decided here, from three inputs: the requested view, the
// page's wall clock, and the page's DATA WINDOW (GET /sites/:id/data-window). The
// client intersects date ranges the server gave it; it computes no site history itself.
//
// Plan: Pulse/docs/plans/22-09-2026-unified-time-range-design.md §12 (spec) and §11.14
// (the closest-view rules, each a way a naive build puts a label over data it does not
// describe).

/** Days are YYYY-MM-DD strings, in the surface's own calendar. */
export interface DateSpan {
  start: string
  end: string
}

/** Why a surface's history starts where it does — said by the server (from_reason). */
export type FromReason = 'first_data' | 'retention' | 'visitor_identity'

/** One surface's data window, as GET /sites/:id/data-window reports it. */
export interface DataWindow {
  from: string
  through: string
  from_reason?: FromReason
}

/** The pages the switcher runs on; the keys of the data-window response. */
export type Surface =
  | 'dashboard'
  | 'pages'
  | 'funnels'
  | 'journeys'
  | 'visitors'
  | 'search'
  | 'search_bing'
  | 'cdn'
  | 'uptime'

/**
 * What the page knows about its history.
 *  - `undefined` — the window has not arrived yet (periodReady waits for it);
 *  - `null` — unknown or empty (a new site, an integration never connected, or the
 *    request failed): the switcher greys NOTHING and adds no suffix, because a guess
 *    would be worse than silence;
 *  - a window — the rules below apply.
 */
export type WindowState = DataWindow | null | undefined

// ─── Day arithmetic on YYYY-MM-DD strings (UTC, so no zone can shift a day) ───

function toUtc(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function fromUtc(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export function addDays(ymd: string, days: number): string {
  return fromUtc(toUtc(ymd) + days * 86_400_000)
}

/** Inclusive length of a span in days. */
export function spanDays(span: DateSpan): number {
  return Math.round((toUtc(span.end) - toUtc(span.start)) / 86_400_000) + 1
}

function monthStart(ymd: string): string {
  return ymd.slice(0, 8) + '01'
}

function monthEnd(ymd: string): string {
  const [y, m] = ymd.split('-').map(Number)
  return fromUtc(Date.UTC(y, m, 0))
}

// ─── "23 Sep" (owner decision 25-09-2026: day first, the year only when not this year) ───

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function parts(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split('-').map(Number)
  return { y, m, d }
}

/** "23 Sep", or "30 Mar 2025" when the day is not in `currentYear`. */
export function formatDay(ymd: string, currentYear: number): string {
  const { y, m, d } = parts(ymd)
  return y === currentYear ? `${d} ${MONTHS[m - 1]}` : `${d} ${MONTHS[m - 1]} ${y}`
}

/** "30 Mar 2026" — always with the year: for sentences about where history starts. */
export function formatLongDay(ymd: string): string {
  const { y, m, d } = parts(ymd)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

/** "23 Sep", "19 – 25 Sep", "30 Aug – 5 Sep", "30 Dec 2025 – 3 Jan". */
export function formatSpan(span: DateSpan, currentYear: number): string {
  if (span.start === span.end) return formatDay(span.start, currentYear)
  const a = parts(span.start)
  const b = parts(span.end)
  if (a.y === b.y) {
    const year = a.y === currentYear ? '' : ` ${a.y}`
    if (a.m === b.m) return `${a.d} – ${b.d} ${MONTHS[b.m - 1]}${year}`
    return `${a.d} ${MONTHS[a.m - 1]} – ${b.d} ${MONTHS[b.m - 1]}${year}`
  }
  return `${formatDay(span.start, currentYear)} – ${formatDay(span.end, currentYear)}`
}

// ─── Per-surface words ───────────────────────────────────────────────────────

/** Why a surface has nothing AFTER its newest day (a lag, not a gap). */
function lagSentence(surface: Surface): string | null {
  if (surface === 'search') return 'Search Console reports each day about two days late'
  if (surface === 'journeys') return 'Journeys are built overnight'
  return null
}

/** Why a surface has nothing BEFORE its first day, as a sentence subject. */
function historySentence(surface: Surface, w: DataWindow, retentionMonths?: number | null): string {
  if (w.from_reason === 'retention' && retentionMonths) {
    return `This site keeps ${retentionMonths} months of history`
  }
  if (w.from_reason === 'visitor_identity') return `Visitor history starts ${formatLongDay(w.from)}`
  switch (surface) {
    case 'search':
      return `Search Console data starts ${formatLongDay(w.from)}`
    case 'search_bing':
      return `Bing data starts ${formatLongDay(w.from)}`
    case 'uptime':
      return `Uptime history starts ${formatLongDay(w.from)}`
    case 'cdn':
      return `CDN history starts ${formatLongDay(w.from)}`
    case 'visitors':
      return `Visitor history starts ${formatLongDay(w.from)}`
    default:
      return `This site's data starts ${formatLongDay(w.from)}`
  }
}

/** The greyed row's own reason (its `title` and the target of `aria-describedby`). */
function rowReason(surface: Surface, w: DataWindow, span: DateSpan, retentionMonths?: number | null): string {
  if (span.start > w.through) {
    return lagSentence(surface) ?? `No data after ${formatLongDay(w.through)} yet`
  }
  if (w.from_reason === 'retention' && retentionMonths) return `This site keeps ${retentionMonths} months of history`
  if (w.from_reason === 'visitor_identity' || surface === 'visitors') return `Visitor history starts ${formatLongDay(w.from)}`
  switch (surface) {
    case 'search':
      return `No Search Console data before ${formatLongDay(w.from)}`
    case 'search_bing':
      return `No Bing data before ${formatLongDay(w.from)}`
    case 'uptime':
      return `Uptime history starts ${formatLongDay(w.from)}`
    case 'cdn':
      return `CDN history starts ${formatLongDay(w.from)}`
    default:
      return `No data before ${formatLongDay(w.from)}`
  }
}

// ─── Rows ────────────────────────────────────────────────────────────────────

export interface RowState {
  key: Period
  label: string
  section: 'relative' | 'calendar'
  available: boolean
  /** Why the row is greyed. Present exactly when `available` is false. */
  reason?: string
}

export interface ViewContext {
  surface: Surface
  /** The page's wall clock: the site's (UTC on CDN, whose days are Bunny's UTC days). */
  now: Date
  window: WindowState
  retentionMonths?: number | null
}

/** A row's own range on this page. All time is the window itself. */
export function rowSpan(row: Pick<PeriodPreset, 'key' | 'resolve'>, now: Date, window: WindowState): DateSpan {
  if (row.key === 'all') {
    return window ? { start: window.from, end: window.through } : row.resolve(now)
  }
  return row.resolve(now)
}

/** True when `span` holds any day of the window — the ONE rule for greying. */
export function hasData(span: DateSpan, w: DataWindow): boolean {
  return !(span.end < w.from || span.start > w.through)
}

/**
 * The twelve rows (the eleven named ones here; Custom range… is the picker's own row),
 * each available or greyed with its reason. The same rows, in the same order, on every
 * page — only availability differs (the one-menu invariant).
 */
export function viewRows(ctx: ViewContext): RowState[] {
  const w = ctx.window
  return PERIOD_PRESETS.map((row) => {
    const base = { key: row.key as Period, label: row.label, section: row.section }
    if (!w || row.key === 'all') return { ...base, available: true }
    const span = rowSpan(row, ctx.now, w)
    if (hasData(span, w)) return { ...base, available: true }
    return { ...base, available: false, reason: rowReason(ctx.surface, w, span, ctx.retentionMonths) }
  })
}

/** The share page: the same twelve rows, only its four fixed windows available (§12). */
export const SHARE_ROW_KEYS: readonly Period[] = ['today', 'yesterday', '7', '30']
export const SHARE_FIXED_RANGES_REASON = 'A shared dashboard shows fixed ranges.'

export function shareRows(): RowState[] {
  return PERIOD_PRESETS.map((row) => {
    const available = SHARE_ROW_KEYS.includes(row.key as Period)
    return {
      key: row.key as Period,
      label: row.label,
      section: row.section,
      available,
      ...(available ? {} : { reason: SHARE_FIXED_RANGES_REASON }),
    }
  })
}

/**
 * The muted line under the list when rows are greyed (copy as mocked and approved,
 * plan §11.6 item 6), or null when nothing is.
 */
export function listFootnote(ctx: ViewContext, rows: RowState[]): string | null {
  const w = ctx.window
  if (!w || rows.every((r) => r.available)) return null
  const lag = lagSentence(ctx.surface)
  const afterGreyed = rows.some((r) => !r.available && rowSpan(findPreset(r.key)!, ctx.now, w).start > w.through)
  if (ctx.surface === 'journeys' && afterGreyed) return 'Journeys are built overnight, so today shows up tomorrow.'
  if (ctx.surface === 'search') {
    return `${lag}. Data starts ${formatLongDay(w.from)}.`
  }
  if (w.from_reason === 'retention' && ctx.retentionMonths) {
    return `This site keeps ${ctx.retentionMonths} months of history, so longer ranges start on ${formatDay(w.from, ctx.now.getFullYear())}.`
  }
  if (w.from_reason === 'visitor_identity' || ctx.surface === 'visitors') {
    return `Visitor history starts ${formatLongDay(w.from)}. Longer ranges show from that day.`
  }
  const sentence = `${historySentence(ctx.surface, w, ctx.retentionMonths)}.`
  // "Last year opens in January" — only where the data starts THIS year, so the only
  // thing standing between the reader and Last year is the calendar.
  const lastYearGreyed = rows.some((r) => r.key === 'last-year' && !r.available)
  const eventsSurface = ctx.surface === 'dashboard' || ctx.surface === 'pages' || ctx.surface === 'funnels'
  if (eventsSurface && lastYearGreyed && Number(w.from.slice(0, 4)) === ctx.now.getFullYear()) {
    return `${sentence} Last year opens in January.`
  }
  return sentence
}

// ─── The applied view ────────────────────────────────────────────────────────

export interface RequestedView {
  period: Period
  /** The span, for a custom view (the token alone is not the view). */
  range?: DateSpan
}

export interface AppliedView {
  /**
   * What the page FETCHES with: the requested token, or 'custom' when the view became a
   * concrete range (a closest view, a clamp). Never the token of a view it is not
   * showing — keeping period=today on the wire while relabelling the button would render
   * today's empty data under "23 Sep · latest day" (§11.14 rule 1).
   */
  period: Period
  range: DateSpan
  /** The menu row that is ticked — the APPLIED view, never the remembered token. */
  tick: Period | null
  label: string
  /** The muted tail on the closed button: "since 26 Aug", "latest day"… */
  suffix: string | null
  /** A sentence for the list footnote when the view was substituted. */
  note: string | null
  substituted: 'closest' | 'clamped' | null
}

export interface ResolveInput extends ViewContext {
  requested: RequestedView
  /** The page API's ceiling in days (366; Search 480). All time is exempt. */
  maxDays: number
  /** Periods that are a live MODE here (realtime). */
  modes?: readonly Period[]
}

/** The suffix for a range that runs past the data on one or both ends. */
export function composeSuffix(span: DateSpan, w: WindowState, currentYear: number): string | null {
  if (!w) return null
  const before = span.start < w.from
  const after = span.end > w.through
  if (before && after) return `${formatDay(w.from, currentYear)} – ${formatDay(w.through, currentYear)}`
  if (before) return `since ${formatDay(w.from, currentYear)}`
  if (after) return `through ${formatDay(w.through, currentYear)}`
  return null
}

function rowLabel(key: Period): string | null {
  return findPreset(key)?.label ?? null
}

/**
 * The view the page shows for what was requested (URL or memory): the requested view
 * itself when this page has data for it, else the CLOSEST VIEW — the most recent span of
 * the same kind and length that has data (§11.15) — or a range clamped to the page's
 * ceiling. It never writes anything: the URL and both memories keep what was asked.
 */
export function resolveView(input: ResolveInput): AppliedView {
  const { requested, now, window: w, maxDays } = input
  const year = now.getFullYear()
  const today = formatDate(now)

  if (input.modes?.includes(requested.period)) {
    return {
      period: requested.period,
      range: periodToDateRange(requested.period, now),
      tick: null,
      label: 'Realtime',
      suffix: null,
      note: null,
      substituted: null,
    }
  }

  const preset = findPreset(requested.period)
  let span: DateSpan =
    requested.period === 'custom' && requested.range
      ? requested.range
      : preset
        ? rowSpan(preset, now, w)
        : periodToDateRange(requested.period, now)

  // All time: the window, first day to newest; resolved by the server on the wire.
  if (requested.period === 'all') {
    const suffix = w
      ? w.through < today
        ? `${formatDay(w.from, year)} – ${formatDay(w.through, year)}`
        : `since ${formatDay(w.from, year)}`
      : null
    return { period: 'all', range: span, tick: 'all', label: 'All time', suffix, note: null, substituted: null }
  }

  let period: Period = requested.period
  let substituted: AppliedView['substituted'] = null

  // A span over this page's ceiling (a carried custom range, an old 16m link on the
  // analytics API) is clamped KEEPING ITS END DATE, and shown as the clamped dates.
  if (spanDays(span) > maxDays) {
    span = { start: addDays(span.end, -(maxDays - 1)), end: span.end }
    period = 'custom'
    substituted = 'clamped'
  }

  if (w && !hasData(span, w)) {
    return closestView(input, span, w)
  }

  if (substituted === 'clamped' || period === 'custom' || !preset) {
    return {
      period,
      range: span,
      tick: period === 'custom' && substituted === null ? 'custom' : null,
      label: formatSpan(span, year),
      suffix: composeSuffix(span, w, year),
      note: null,
      substituted,
    }
  }

  return {
    period,
    range: span,
    tick: period,
    label: preset.label,
    suffix: composeSuffix(span, w, year),
    note: null,
    substituted: null,
  }
}

/**
 * The most recent span of the same kind and length that has data (§11.15):
 *  - a day (Today, Yesterday) → the latest day with data;
 *  - a trailing or custom span → the same length ending at the page's newest day;
 *  - a calendar month or year → the latest one with data.
 * Fetched as a concrete range with the period token cleared, ticked in the menu when it
 * IS a row, and labelled so the button names what is shown ("23 Sep · latest day").
 */
function closestView(input: ResolveInput, requestedSpan: DateSpan, w: DataWindow): AppliedView {
  const { requested, now } = input
  const year = now.getFullYear()
  const today = formatDate(now)
  const yesterday = addDays(today, -1)
  // A menu row knows its kind. Anything else — a custom range, an arrow-shifted one, an
  // old link's token (1h, 30m, week…) — is judged by its SHAPE: one day is a day, so it
  // lands on the latest day like Today does, never on "the latest 1 days".
  const kind = findPreset(requested.period)?.kind ?? (spanDays(requestedSpan) === 1 ? 'day' : 'trailing')
  const requestedLabel =
    rowLabel(requested.period) ?? formatSpan(requestedSpan, year)

  let range: DateSpan
  let tick: Period | null = null
  let label: string
  let suffix: string
  let unit: string

  if (kind === 'day') {
    range = { start: w.through, end: w.through }
    unit = 'day'
    suffix = 'latest day'
    // The latest day is named by its row when it has one, either side: a site created
    // today with Yesterday remembered lands on Today, as a journeys page lands on
    // Yesterday — ticked, so the open menu agrees with the button.
    if (w.through === today) {
      tick = 'today'
      label = 'Today'
    } else if (w.through === yesterday) {
      tick = 'yesterday'
      label = 'Yesterday'
    } else {
      label = formatDay(w.through, year)
    }
  } else if (kind === 'month') {
    const start = monthStart(w.through)
    const end = monthEnd(w.through) < today ? monthEnd(w.through) : today
    range = { start, end }
    unit = 'month'
    suffix = 'latest month'
    if (start === monthStart(today)) {
      tick = 'month'
      label = 'This month'
    } else if (start === monthStart(addDays(monthStart(today), -1))) {
      tick = 'last-month'
      label = 'Last month'
    } else {
      const { y, m } = parts(start)
      label = y === year ? MONTHS_LONG[m - 1] : `${MONTHS_LONG[m - 1]} ${y}`
    }
  } else if (kind === 'year') {
    const y = Number(w.through.slice(0, 4))
    const end = `${y}-12-31` < today ? `${y}-12-31` : today
    range = { start: `${y}-01-01`, end }
    unit = 'year'
    suffix = 'latest year'
    if (y === year) {
      tick = 'year'
      label = 'This year'
    } else if (y === year - 1) {
      tick = 'last-year'
      label = 'Last year'
    } else {
      label = String(y)
    }
  } else {
    // trailing, custom, or an old token: the same length, ending at the newest day.
    const n = spanDays(requestedSpan)
    range = { start: addDays(w.through, -(n - 1)), end: w.through }
    const preset = findPreset(requested.period)
    const phrase = preset ? preset.label.replace(/^Last /, '') : `${n} days` // n ≥ 2 here: one day is the day branch
    unit = phrase
    suffix = `latest ${phrase}`
    label = formatSpan(range, year)
  }

  const reason = requestedSpan.start > w.through
    ? (lagSentence(input.surface) ?? `The latest data here is from ${formatLongDay(w.through)}`)
    : historySentence(input.surface, w, input.retentionMonths)
  const shown = tick ? label.toLowerCase() : label
  const note = `You chose ${requestedLabel}. ${reason}, so this shows the latest ${unit}${tick ? '' : ' it has'}: ${shown}.`

  return { period: 'custom', range, tick, label, suffix, note, substituted: 'closest' }
}
