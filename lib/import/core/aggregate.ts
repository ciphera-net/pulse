// ─── Aggregate rows in, one row per client key out ────────────────────────
//
// An `upload_aggregate` source (M2-o) already counts per day, so its rows map
// onto the wire tables nearly one to one. "Nearly" is the whole job of this
// module: the source's grain is often FINER than the wire key, and the server
// rejects a batch that carries the same client key twice (`422 duplicate_row`).
//
//   - a page seen on two hostnames is one `page` row;
//   - a browser in three versions is one `browser` row;
//   - a country split by region and city is one `country` row;
//   - an acquisition row per referrer URL, utm_content and utm_term is one row
//     per (date, referrer, src_source, src_medium, src_campaign).
//
// So rows are folded on the client key as they arrive — counts summed, the same
// rule as the server's `foldImportedRows` — and every key is sent exactly once
// (M2-d). A field that is not in the key and on which the folded rows DISAGREE
// (an acquisition row's `utm_source`, say) becomes null: the merged row has no
// single value for it, and picking one would attribute visitors to a tag some
// of them never carried.
//
// Days outside the clip are dropped here, as they arrive, so the skip report
// can name the file and line. The cardinality caps (cap.ts) run in `build()`,
// once every row of a day is known.
//
// 🔴 MEMORY: every distinct key is held until `build()`. Past
// AGGREGATE_ROW_LIMIT distinct keys this stops with `file_too_large_for_browser`
// rather than letting the tab run out of memory mid-read. That is a named
// failure the customer can act on (split the export by date); a crashed tab is
// not.

import { ImportError, wrongFile } from '../errors'
import type { AcquisitionRow, AggregateRows, DailyRow, DimensionRow, MonthlyRow } from '../types'
import {
  ACQUISITION_TUPLE_CAP,
  DIMENSION_VALUE_CAP,
  OTHER,
  capGroup,
  clipReason,
  sumNullable,
  type Clip,
} from './cap'
import { monthEnd, monthStart } from './dates'
import type { RowRef, SkipLedger } from './skipped'

/** Distinct aggregate keys held at once before the read stops (see the header). */
export const AGGREGATE_ROW_LIMIT = 2_000_000

/** The largest count the wire accepts (M2-k, M2-r). */
export const MAX_COUNT = 1_000_000_000

export class AggregateBuilder {
  private readonly daily = new Map<string, DailyRow>()
  private readonly monthly = new Map<string, MonthlyRow>()
  private readonly dimensions = new Map<string, DimensionRow>()
  private readonly acquisition = new Map<string, AcquisitionRow>()
  private keys = 0

  constructor(
    private readonly clip: Clip | null,
    private readonly skipped: SkipLedger,
    private readonly limit = AGGREGATE_ROW_LIMIT,
  ) {}

  // Each add returns whether the row was kept (false = outside the clip,
  // already counted as skipped), so a source can attach its own skip to the
  // same row only when the row itself was in range.

  addDaily(row: DailyRow, at: RowRef): boolean {
    if (this.clipped(row.date, at)) return false
    const have = this.daily.get(row.date)
    if (!have) {
      this.hold()
      this.daily.set(row.date, { ...row })
      return true
    }
    have.visitors += row.visitors
    have.visits += row.visits
    have.pageviews += row.pageviews
    have.src_bounces = sumNullable(have.src_bounces, row.src_bounces)
    have.src_engagement_seconds = sumNullable(have.src_engagement_seconds, row.src_engagement_seconds)
    return true
  }

  /** A month's unique count, written only when the source genuinely has one (M2-k). */
  addMonthly(row: MonthlyRow, at: RowRef): boolean {
    // A month that reaches outside the clip loses days the server will not
    // take, so its unique count no longer describes the imported days: the
    // server drops such a row too, and the seam sums the days instead (M2-r).
    const before = clipReason(this.clip, monthStart(row.month))
    const after = clipReason(this.clip, monthEnd(row.month))
    const reason = before ?? after
    if (reason) {
      this.skipped.add(reason, at)
      return false
    }
    const have = this.monthly.get(row.month)
    if (!have) {
      this.hold()
      this.monthly.set(row.month, { ...row })
      return true
    }
    have.visitors += row.visitors
    have.full_month = have.full_month && row.full_month
    return true
  }

  addDimension(row: DimensionRow, at: RowRef): boolean {
    if (this.clipped(row.date, at)) return false
    const key = JSON.stringify([row.date, row.dimension, row.parent, row.value])
    const have = this.dimensions.get(key)
    if (!have) {
      this.hold()
      this.dimensions.set(key, { ...row })
      return true
    }
    have.visitors += row.visitors
    have.visits = sumNullable(have.visits, row.visits)
    have.pageviews = sumNullable(have.pageviews, row.pageviews)
    return true
  }

  addAcquisition(row: AcquisitionRow, at: RowRef): boolean {
    if (this.clipped(row.date, at)) return false
    const key = JSON.stringify([row.date, row.referrer, row.src_source, row.src_medium, row.src_campaign])
    const have = this.acquisition.get(key)
    if (!have) {
      this.hold()
      this.acquisition.set(key, { ...row })
      return true
    }
    have.visitors += row.visitors
    have.visits += row.visits
    have.pageviews += row.pageviews
    if (have.utm_source !== row.utm_source) have.utm_source = null
    if (have.utm_medium !== row.utm_medium) have.utm_medium = null
    if (have.utm_campaign !== row.utm_campaign) have.utm_campaign = null
    if (have.src_channel_group !== row.src_channel_group) have.src_channel_group = ''
    return true
  }

  /** Caps, sorts and returns every table. The builder is spent afterwards. */
  build(): AggregateRows {
    const rows: AggregateRows = {
      daily: [...this.daily.values()],
      monthly: [...this.monthly.values()],
      dimensions: capDimensions([...this.dimensions.values()]),
      acquisition: capAcquisition([...this.acquisition.values()]),
    }
    sortRows(rows)
    assertCounts(rows)
    return rows
  }

  private clipped(date: string, at: RowRef): boolean {
    const reason = clipReason(this.clip, date)
    if (!reason) return false
    this.skipped.add(reason, at)
    return true
  }

  private hold(): void {
    this.keys++
    if (this.keys > this.limit) {
      throw new ImportError(
        'file_too_large_for_browser',
        'This export holds more rows than a browser tab can fold safely. Export a shorter date range and import it in parts.',
        { detail: { limit: this.limit, observed: this.keys } },
      )
    }
  }
}

/** Per (date, dimension): at most 1,000 values, the rest summed into `(other)`. */
export function capDimensions(rows: DimensionRow[]): DimensionRow[] {
  const groups = new Map<string, DimensionRow[]>()
  for (const r of rows) {
    const g = `${r.date}|${r.dimension}`
    let list = groups.get(g)
    if (!list) groups.set(g, (list = []))
    list.push(r)
  }
  const out: DimensionRow[] = []
  for (const list of groups.values()) {
    const split = capGroup(
      list,
      DIMENSION_VALUE_CAP,
      (r) => ({ visitors: r.visitors, pageviews: r.pageviews, visits: r.visits, tiebreak: `${r.parent}\u0000${r.value}` }),
      (r) => r.value === OTHER,
    )
    if (!split) {
      for (const r of list) out.push(r)
      continue
    }
    for (const r of split.kept) out.push(r)
    const first = split.folded[0]
    const other: DimensionRow = {
      date: first.date,
      dimension: first.dimension,
      parent: '',
      value: OTHER,
      visitors: 0,
      visits: null,
      pageviews: null,
    }
    for (const r of split.folded) {
      other.visitors += r.visitors
      other.visits = sumNullable(other.visits, r.visits)
      other.pageviews = sumNullable(other.pageviews, r.pageviews)
    }
    out.push(other)
  }
  return out
}

/** Per date: at most 1,000 acquisition tuples, the rest summed into referrer `(other)`. */
export function capAcquisition(rows: AcquisitionRow[]): AcquisitionRow[] {
  const groups = new Map<string, AcquisitionRow[]>()
  for (const r of rows) {
    let list = groups.get(r.date)
    if (!list) groups.set(r.date, (list = []))
    list.push(r)
  }
  const out: AcquisitionRow[] = []
  for (const list of groups.values()) {
    const split = capGroup(
      list,
      ACQUISITION_TUPLE_CAP,
      (r) => ({
        visitors: r.visitors,
        pageviews: r.pageviews,
        visits: r.visits,
        tiebreak: [r.referrer, r.src_source, r.src_medium, r.src_campaign].join('\u0000'),
      }),
      (r) => r.referrer === OTHER,
    )
    if (!split) {
      for (const r of list) out.push(r)
      continue
    }
    for (const r of split.kept) out.push(r)
    const other: AcquisitionRow = {
      date: split.folded[0].date,
      referrer: OTHER,
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      src_source: '',
      src_medium: '',
      src_campaign: '',
      src_channel_group: '',
      visitors: 0,
      visits: 0,
      pageviews: 0,
    }
    for (const r of split.folded) {
      other.visitors += r.visitors
      other.visits += r.visits
      other.pageviews += r.pageviews
    }
    out.push(other)
  }
  return out
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** Every table in client-key order, so the same rows always pack the same way. */
export function sortRows(rows: AggregateRows): void {
  rows.daily.sort((a, b) => cmp(a.date, b.date))
  rows.monthly.sort((a, b) => cmp(a.month, b.month))
  rows.dimensions.sort(
    (a, b) => cmp(a.date, b.date) || cmp(a.dimension, b.dimension) || cmp(a.parent, b.parent) || cmp(a.value, b.value),
  )
  rows.acquisition.sort(
    (a, b) =>
      cmp(a.date, b.date) ||
      cmp(a.referrer, b.referrer) ||
      cmp(a.src_source, b.src_source) ||
      cmp(a.src_medium, b.src_medium) ||
      cmp(a.src_campaign, b.src_campaign),
  )
}

/**
 * Every count must be a whole number in 0…1,000,000,000 on the wire (M2-r). A
 * single parsed value is checked where it is read (and skipped as
 * `bad_number`); this catches the one case left, a SUM of valid values that
 * overflows. No real site reaches it, so it is a wrong file, not a skip.
 */
export function assertCounts(rows: AggregateRows): void {
  const check = (table: string, value: number | null) => {
    if (value === null) return
    if (!Number.isSafeInteger(value) || value < 0 || value > MAX_COUNT) {
      throw wrongFile('value_out_of_range', `The export's ${table} counts add up to more than Pulse can store for one day.`, {
        table,
      })
    }
  }
  for (const r of rows.daily) {
    check('daily', r.visitors)
    check('daily', r.visits)
    check('daily', r.pageviews)
    check('daily', r.src_bounces)
    check('daily', r.src_engagement_seconds)
  }
  for (const r of rows.monthly) check('monthly', r.visitors)
  for (const r of rows.dimensions) {
    check('dimensions', r.visitors)
    check('dimensions', r.visits)
    check('dimensions', r.pageviews)
  }
  for (const r of rows.acquisition) {
    check('acquisition', r.visitors)
    check('acquisition', r.visits)
    check('acquisition', r.pageviews)
  }
}
