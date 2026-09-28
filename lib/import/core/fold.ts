// ─── Raw pageviews → per-day aggregates, in the SITE's calendar ────────────
//
// An `upload_raw` source (Umami, Simple Analytics — M8/M9) exports one row per
// pageview. Pulse never receives those rows: they are folded here, in the
// browser, into the same per-day tables an aggregate source sends, and each raw
// row is dropped as soon as it is counted (§3.12, D9). This module is
// source-agnostic — a source adapter turns its own columns into `RawPageview`s
// and nothing else about the source reaches the fold.
//
// Three things make it safe to run over hundreds of megabytes in a tab:
//
// 1. 🔴 THE DAY IS RESOLVED ONCE PER UTC HOUR, NOT PER ROW. `Intl.DateTimeFormat`
//    costs microseconds per call, which is seconds per million rows. What is
//    memoised is the zone's UTC OFFSET at each UTC hour start, and a row's day is
//    then arithmetic. Two consequences are deliberate:
//      - the DAY is not memoised per hour, because a zone with a :30 or :45
//        offset (India, Nepal, Newfoundland, parts of Australia) puts its
//        midnight INSIDE a UTC hour;
//      - an hour whose starting offset differs from the next hour's contains
//        (or ends on) a transition, and those rare hours are resolved per row,
//        because a few zones (Adelaide, St John's, Lord Howe) change offset at
//        half past a UTC hour. Everywhere else, twice a year per zone.
//
// 2. Ids are interned to integers, and distinct counts are `Set<number>`s.
//
// 3. 🔴 THE MEMORY BUDGET COUNTS EVERY SET INSERTION, across every bucket —
//    not the number of buckets, which says nothing about memory. Each new visit
//    record and each newly interned id is counted too, because each is an entry
//    held until the end. Past FOLD_BUDGET the fold stops with the named error
//    `file_too_large_for_browser` instead of taking the tab down.
//
// Entry and exit pages come from the rows' own visit ids: a visit's first
// pageview (by time) is its entrance, its last is its exit, each counted on the
// day that pageview fell. Acquisition is the visit's first pageview's origin.

import { ImportError } from '../errors'
import type { AcquisitionRow, AggregateRows, DailyRow, Dimension, DimensionRow } from '../types'
import { assertCounts, sortRows } from './aggregate'
import { ACQUISITION_TUPLE_CAP, DIMENSION_VALUE_CAP, OTHER, capGroup, clipReason, type Clip } from './cap'
import { fromDayNumber } from './dates'
import { capEvents } from './events'
import type { SkipLedger, SkipReason } from './skipped'

export const FOLD_BUDGET = 20_000_000

const MS_PER_HOUR = 3_600_000
const MS_PER_DAY = 86_400_000

/** Wall-clock parts of an instant in a zone, as an offset from UTC in ms. */
export type OffsetResolver = (atMs: number) => number

/** The real resolver: one `formatToParts` call per instant. */
export function intlOffsetResolver(timeZone: string): OffsetResolver {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  return (atMs: number) => {
    const p = f.formatToParts(atMs)
    const get = (type: string) => {
      for (const part of p) if (part.type === type) return Number(part.value)
      return 0
    }
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
    return asUtc - Math.floor(atMs / 1000) * 1000
  }
}

/** Which calendar day an instant falls on in a zone, resolving the zone once per UTC hour. */
export class DayResolver {
  private readonly offsets = new Map<number, number>()
  private readonly days = new Map<number, string>()
  // The hour the previous instant fell in: rows usually arrive near each other.
  private lastHour = NaN
  private lastOffset = 0
  private lastStable = false

  constructor(private readonly resolveOffset: OffsetResolver) {}

  static forZone(timeZone: string): DayResolver {
    return new DayResolver(intlOffsetResolver(timeZone))
  }

  /** The zone's offset (ms) at `atMs`. */
  offsetAt(atMs: number): number {
    const hour = Math.floor(atMs / MS_PER_HOUR)
    if (hour !== this.lastHour) {
      const start = this.hourOffset(hour)
      this.lastHour = hour
      this.lastOffset = start
      // Same offset at both ends of the hour: nothing changed inside it.
      this.lastStable = start === this.hourOffset(hour + 1)
    }
    return this.lastStable ? this.lastOffset : this.resolveOffset(atMs)
  }

  /** Days since 1970-01-01 of the instant's calendar day in the zone. */
  dayIndexOf(atMs: number): number {
    return Math.floor((atMs + this.offsetAt(atMs)) / MS_PER_DAY)
  }

  /** YYYY-MM-DD for the instant in the zone. */
  dayOf(atMs: number): string {
    const dayIndex = this.dayIndexOf(atMs)
    let day = this.days.get(dayIndex)
    if (day === undefined) {
      day = fromDayNumber(dayIndex)
      this.days.set(dayIndex, day)
    }
    return day
  }

  private hourOffset(hour: number): number {
    let o = this.offsets.get(hour)
    if (o === undefined) {
      o = this.resolveOffset(hour * MS_PER_HOUR)
      this.offsets.set(hour, o)
    }
    return o
  }
}

/** String → dense integer, so distinct counts hold numbers rather than ids. */
export class Interner {
  private readonly ids = new Map<string, number>()

  /** The id for `value`; a new value gets the next id (so `size` grows by one). */
  id(value: string): number {
    const id = this.ids.get(value)
    if (id !== undefined) return id
    const next = this.ids.size
    this.ids.set(value, next)
    return next
  }

  get size(): number {
    return this.ids.size
  }
}

/** The origin of a visit, as the source adapter maps it (acquisition key + tags). */
export interface RawAcquisition {
  referrer: string
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  src_source: string
  src_medium: string
  src_campaign: string
  src_channel_group: string
}

/** Dimensions a raw row may carry. Absent = the source has no such field. */
export type RawDimensions = Partial<Record<'country' | 'device' | 'browser' | 'os' | 'language' | 'screen_resolution', string>> & {
  /** Keyed under the row's country (`parent`). */
  region?: string
  city?: string
}

export interface RawPageview {
  /** Epoch ms, UTC. */
  at: number
  /**
   * The source's visitor (or session) id. Interned, counted, never sent.
   * `null` for a source with no per-row identity signal (Simple Analytics,
   * M9-e): the row still counts toward `pageviews` everywhere it lands, but
   * contributes to no `visitors` distinct count.
   */
  visitor: string | null
  /**
   * The source's visit id. Interned, counted, never sent. `null` alongside a
   * `null` `.visitor` (M9-e): the row contributes to no `visits` distinct
   * count and mints no `VisitRecord` — no entrance, no exit, no acquisition
   * from that row.
   */
  visit: string | null
  page: string
  acquisition: RawAcquisition | null
  dimensions: RawDimensions
  file: string
  line: number
}

/**
 * One custom event a raw source recorded (M12-h). It is counted into its
 * site-local day under its cleaned source label and dropped; nothing about the
 * row but that label and the day ever leaves the fold.
 */
export interface RawEvent {
  /** Epoch ms, UTC. */
  at: number
  /** The source's label, already cleaned (core/events.ts `cleanSourceName`) and non-empty. */
  name: string
  /**
   * The source's visitor (Umami: `session_id`), interned and counted for the
   * day's distinct `visitors`, never sent. `null` for a source with no unique
   * signal on events (Simple Analytics): the day's `visitors` is then null,
   * never a zero the source did not measure.
   */
  visitor: string | null
  file: string
  line: number
}

/**
 * One (day, dimension, value) — or one day, or one acquisition tuple. Its two
 * distinct counts hold their FIRST member inline and allocate a Set only on
 * the second: most day×value buckets of a real site never get one, and a Set
 * per bucket was most of the fold's cost. Every new distinct member counts
 * against the budget however it is stored.
 */
interface Bucket {
  visitor: number | null
  visitors: Set<number> | null
  visit: number | null
  visits: Set<number> | null
  pageviews: number
}

// Two copies of the same three lines, one per count, on purpose: this is the
// fold's innermost operation, and a keyed `b[field]` access here measured
// several times slower than named properties V8 can inline.

/** Adds a visitor id; 1 if it was new to this bucket, else 0. */
function addVisitor(b: Bucket, id: number): number {
  const set = b.visitors
  if (set) {
    const n = set.size
    set.add(id)
    return set.size - n
  }
  if (b.visitor === null) {
    b.visitor = id
    return 1
  }
  if (b.visitor === id) return 0
  const set2 = new Set<number>()
  set2.add(b.visitor)
  set2.add(id)
  b.visitors = set2
  return 1
}

/** Adds a visit id; 1 if it was new to this bucket, else 0. */
function addVisit(b: Bucket, id: number): number {
  const set = b.visits
  if (set) {
    const n = set.size
    set.add(id)
    return set.size - n
  }
  if (b.visit === null) {
    b.visit = id
    return 1
  }
  if (b.visit === id) return 0
  const set2 = new Set<number>()
  set2.add(b.visit)
  set2.add(id)
  b.visits = set2
  return 1
}

function visitorsOf(b: Bucket): number {
  return b.visitors ? b.visitors.size : b.visitor === null ? 0 : 1
}

function visitsOf(b: Bucket): number {
  return b.visits ? b.visits.size : b.visit === null ? 0 : 1
}

function eachVisitor(b: Bucket, fn: (id: number) => void): void {
  if (b.visitors) b.visitors.forEach(fn)
  else if (b.visitor !== null) fn(b.visitor)
}

function eachVisit(b: Bucket, fn: (id: number) => void): void {
  if (b.visits) b.visits.forEach(fn)
  else if (b.visit !== null) fn(b.visit)
}

interface VisitRecord {
  /** `null` only when a source somehow sends a real `.visit` with no `.visitor` (M9-e never does). */
  visitor: number | null
  pageviews: number
  firstAt: number
  firstDay: DayState
  entryPage: string
  lastAt: number
  lastDay: DayState
  exitPage: string
  acquisition: RawAcquisition | null
}

/** Everything held for one site-local day. */
interface DayState {
  date: string
  /** Set when the whole day is outside the clip: its rows are counted and dropped. */
  skip: SkipReason | null
  daily: Bucket
  /** One map per dimension (by DIMENSION_INDEX), keyed by the value — or, for region and city, by `placeKey`. */
  dims: (Map<string, Bucket> | undefined)[]
  /** Custom events by cleaned source label (M12): `pageviews` counts the rows. */
  events: Map<string, EventBucket> | undefined
}

/** A day's count of one custom event; `identified` is whether any of its rows carried a visitor. */
interface EventBucket extends Bucket {
  identified: boolean
}

const DIMENSION_INDEX: Readonly<Record<Dimension, number>> = {
  page: 0,
  entry_page: 1,
  exit_page: 2,
  country: 3,
  region: 4,
  city: 5,
  device: 6,
  browser: 7,
  os: 8,
  language: 9,
  screen_resolution: 10,
}
const DIMENSION_BY_INDEX = Object.keys(DIMENSION_INDEX) as Dimension[]
const FLAT_DIMENSIONS = ['country', 'device', 'browser', 'os', 'language', 'screen_resolution'] as const
const FLAT_INDEX = FLAT_DIMENSIONS.map((d) => DIMENSION_INDEX[d])

export interface FoldOptions {
  timeZone: string
  clip: Clip | null
  skipped: SkipLedger
  budget?: number
  /** Injected in tests to count how often the zone is resolved. */
  resolveOffset?: OffsetResolver
  /**
   * Whether a visit's last pageview produces an `exit_page` row (M9-e).
   * Default `true` (every source before M9). `false` for a source whose
   * "visit" is by construction one pageview (Simple Analytics): a computed
   * exit page would be a mechanical duplicate of the entry page, not a real
   * measurement. `entry_page` is unaffected either way.
   */
  emitExitPages?: boolean
}

export class RawFolder {
  private readonly days: DayResolver
  private readonly visitors = new Interner()
  private readonly visitIds = new Interner()
  private readonly byDay = new Map<number, DayState>()
  private lastIndex = NaN
  private lastDay: DayState | null = null
  /** Indexed by interned visit id. */
  private readonly visits: VisitRecord[] = []
  private readonly budget: number
  private readonly emitExitPages: boolean
  private units = 0

  constructor(private readonly options: FoldOptions) {
    this.days = new DayResolver(options.resolveOffset ?? intlOffsetResolver(options.timeZone))
    this.budget = options.budget ?? FOLD_BUDGET
    this.emitExitPages = options.emitExitPages ?? true
  }

  /** Total Set insertions (and held records) so far — what the budget counts. */
  get insertions(): number {
    return this.units
  }

  add(row: RawPageview): void {
    const day = this.dayState(this.days.dayIndexOf(row.at))
    if (day.skip) {
      this.options.skipped.add(day.skip, { file: row.file, line: row.line })
      return
    }
    const held = this.visitors.size + this.visitIds.size
    // M9-e: a null id is never interned (a source with no identity signal for
    // this row, e.g. Simple Analytics' `is_unique=false`); it counts toward
    // `pageviews` everywhere below but never toward a distinct `visitors` or
    // `visits` count, and (visit === null) mints no VisitRecord at all.
    const visitor = row.visitor === null ? null : this.visitors.id(row.visitor)
    const visit = row.visit === null ? null : this.visitIds.id(row.visit)
    const fresh = this.visitors.size + this.visitIds.size - held
    if (fresh) this.charge(fresh)

    this.count(day.daily, visitor, visit)
    this.count(this.dimBucket(day, DIMENSION_INDEX.page, row.page), visitor, visit)
    const d = row.dimensions
    for (let i = 0; i < FLAT_DIMENSIONS.length; i++) {
      const value = d[FLAT_DIMENSIONS[i]]
      if (value !== undefined) this.count(this.dimBucket(day, FLAT_INDEX[i], value), visitor, visit)
    }
    if (d.region !== undefined) {
      this.count(this.dimBucket(day, DIMENSION_INDEX.region, placeKey(d.country ?? '', d.region)), visitor, visit)
    }
    if (d.city !== undefined) {
      this.count(this.dimBucket(day, DIMENSION_INDEX.city, placeKey(d.country ?? '', d.city)), visitor, visit)
    }

    // No visit id: no VisitRecord, so no entrance, no exit and no acquisition
    // come from this row (M9-e). It has already counted toward every bucket's
    // `pageviews` above.
    if (visit === null) return

    const rec = this.visits[visit]
    if (!rec) {
      this.charge(1)
      this.visits[visit] = {
        visitor,
        pageviews: 1,
        firstAt: row.at,
        firstDay: day,
        entryPage: row.page,
        lastAt: row.at,
        lastDay: day,
        exitPage: row.page,
        acquisition: row.acquisition,
      }
      return
    }
    rec.pageviews++
    // Ties keep the earlier row for the entrance and the later row for the
    // exit, so a file in time order gives the obvious answer.
    if (row.at < rec.firstAt) {
      rec.firstAt = row.at
      rec.firstDay = day
      rec.entryPage = row.page
      rec.acquisition = row.acquisition
    }
    if (row.at >= rec.lastAt) {
      rec.lastAt = row.at
      rec.lastDay = day
      rec.exitPage = row.page
    }
  }

  /**
   * Counts one custom event into its site-local day (M12-h): `count` is the
   * rows, `visitors` the distinct visitors that day. A day outside the clip
   * counts the row under the clip's reason, as a pageview's would.
   */
  addEvent(row: RawEvent): void {
    const day = this.dayState(this.days.dayIndexOf(row.at))
    if (day.skip) {
      this.options.skipped.add(day.skip, { file: row.file, line: row.line })
      return
    }
    let events = day.events
    if (!events) day.events = events = new Map()
    let b = events.get(row.name)
    if (!b) {
      this.charge(1)
      b = { ...newBucket(), identified: false }
      events.set(row.name, b)
    }
    b.pageviews++
    if (row.visitor === null) return
    const held = this.visitors.size
    const visitor = this.visitors.id(row.visitor)
    if (this.visitors.size > held) this.charge(1)
    b.identified = true
    const grew = addVisitor(b, visitor)
    if (grew) this.charge(grew)
  }

  /** Every table, capped (M2-k) and sorted. The folder is spent afterwards. */
  finish(): AggregateRows {
    const out: AggregateRows = { daily: [], monthly: [], dimensions: [], acquisition: [], events: [] }

    for (const day of this.byDay.values()) {
      if (day.skip) continue
      const b = day.daily
      const row: DailyRow = {
        date: day.date,
        visitors: visitorsOf(b),
        visits: visitsOf(b),
        pageviews: b.pageviews,
        src_bounces: null,
        src_engagement_seconds: null,
      }
      // A day with custom events and no pageview (M12) is not a day of
      // traffic: it sends its events and no daily row of zeros.
      if (b.pageviews > 0) out.daily.push(row)
      if (day.events) {
        for (const [name, e] of day.events) {
          out.events.push({ date: day.date, source_name: name, visitors: e.identified ? visitorsOf(e) : null, count: e.pageviews })
        }
      }
    }
    // M12-g: 1,000 named events per day plus `(other)`, whose visitors are the
    // folded names' sum (the aggregate sources' rule; a union would need every
    // id held past this point for one row that is already an estimate).
    out.events = capEvents(out.events)

    // Entrances, exits and acquisition come from the visits, counted on the
    // day of the pageview they describe.
    const acq = new Map<string, { a: RawAcquisition; date: string; b: Bucket }>()
    this.visits.forEach((v, visitId) => {
      this.countVisit(this.dimBucket(v.firstDay, DIMENSION_INDEX.entry_page, v.entryPage), v, visitId)
      // M9-e: a source whose "visit" is by construction one pageview
      // (Simple Analytics) has no real exit page to report — its last
      // pageview IS its first, so a computed exit_page row would be a
      // mechanical duplicate, not a measurement.
      if (this.emitExitPages) {
        this.countVisit(this.dimBucket(v.lastDay, DIMENSION_INDEX.exit_page, v.exitPage), v, visitId)
      }
      if (v.acquisition) {
        const a = v.acquisition
        const k = JSON.stringify([v.firstDay.date, a.referrer, a.src_source, a.src_medium, a.src_campaign])
        let entry = acq.get(k)
        if (!entry) {
          entry = { a, date: v.firstDay.date, b: newBucket() }
          acq.set(k, entry)
        }
        this.countVisit(entry.b, v, visitId)
      }
    })

    for (const day of this.byDay.values()) {
      if (day.skip) continue
      day.dims.forEach((values, index) => {
        if (!values) return
        const dimension = DIMENSION_BY_INDEX[index]
        const place = dimension === 'region' || dimension === 'city'
        const list: { parent: string; value: string; b: Bucket }[] = []
        for (const [k, b] of values) {
          const [parent, value] = place ? unplaceKey(k) : ['', k]
          list.push({ parent, value, b })
        }
        const split = capGroup(
          list,
          DIMENSION_VALUE_CAP,
          (x) => ({ visitors: visitorsOf(x.b), pageviews: x.b.pageviews, visits: visitsOf(x.b), tiebreak: `${x.parent}\u0000${x.value}` }),
          (x) => x.value === OTHER,
        )
        const kept = split ? split.kept : list
        for (const x of kept) out.dimensions.push(dimensionRow(day.date, dimension, x.parent, x.value, x.b))
        if (split) out.dimensions.push(dimensionRow(day.date, dimension, '', OTHER, this.union(split.folded.map((x) => x.b))))
      })
    }

    const acqByDay = new Map<string, { a: RawAcquisition; date: string; b: Bucket }[]>()
    for (const entry of acq.values()) {
      let list = acqByDay.get(entry.date)
      if (!list) acqByDay.set(entry.date, (list = []))
      list.push(entry)
    }
    for (const [date, list] of acqByDay) {
      const split = capGroup(
        list,
        ACQUISITION_TUPLE_CAP,
        (x) => ({
          visitors: visitorsOf(x.b),
          pageviews: x.b.pageviews,
          visits: visitsOf(x.b),
          tiebreak: [x.a.referrer, x.a.src_source, x.a.src_medium, x.a.src_campaign].join('\u0000'),
        }),
        (x) => x.a.referrer === OTHER,
      )
      const kept = split ? split.kept : list
      for (const x of kept) out.acquisition.push(acquisitionRow(date, x.a, x.b))
      if (split) {
        const other: RawAcquisition = {
          referrer: OTHER,
          utm_source: null,
          utm_medium: null,
          utm_campaign: null,
          src_source: '',
          src_medium: '',
          src_campaign: '',
          src_channel_group: '',
        }
        out.acquisition.push(acquisitionRow(date, other, this.union(split.folded.map((x) => x.b))))
      }
    }

    sortRows(out)
    assertCounts(out)
    return out
  }

  private dayState(index: number): DayState {
    if (index === this.lastIndex && this.lastDay) return this.lastDay
    let day = this.byDay.get(index)
    if (!day) {
      const date = fromDayNumber(index)
      day = { date, skip: clipReason(this.options.clip, date), daily: newBucket(), dims: [], events: undefined }
      this.byDay.set(index, day)
    }
    this.lastIndex = index
    this.lastDay = day
    return day
  }

  private dimBucket(day: DayState, index: number, key: string): Bucket {
    let values = day.dims[index]
    if (!values) day.dims[index] = values = new Map()
    let b = values.get(key)
    if (!b) {
      b = newBucket()
      values.set(key, b)
    }
    return b
  }

  private count(b: Bucket, visitor: number | null, visit: number | null): void {
    b.pageviews++
    let grew = 0
    if (visitor !== null) grew += addVisitor(b, visitor)
    if (visit !== null) grew += addVisit(b, visit)
    if (grew) this.charge(grew)
  }

  private countVisit(b: Bucket, v: VisitRecord, visitId: number): void {
    b.pageviews += v.pageviews
    // `visitId` is always real: countVisit is only ever called for a
    // VisitRecord, which by construction (`add()`, above) exists only for a
    // row whose `.visit` was non-null.
    let grew = addVisit(b, visitId)
    if (v.visitor !== null) grew += addVisitor(b, v.visitor)
    if (grew) this.charge(grew)
  }

  /** The `(other)` bucket of an overflowing group: a true union, so its visitors are distinct. */
  private union(buckets: Bucket[]): Bucket {
    const out = newBucket()
    let grew = 0
    for (const b of buckets) {
      out.pageviews += b.pageviews
      eachVisitor(b, (id) => {
        grew += addVisitor(out, id)
      })
      eachVisit(b, (id) => {
        grew += addVisit(out, id)
      })
    }
    this.charge(grew)
    return out
  }

  private charge(n: number): void {
    this.units += n
    if (this.units > this.budget) {
      throw new ImportError(
        'file_too_large_for_browser',
        'This export has more visits than a browser tab can fold safely. Export a shorter date range and import it in parts.',
        { detail: { limit: this.budget, observed: this.units } },
      )
    }
  }
}

function newBucket(): Bucket {
  return { visitor: null, visitors: null, visit: null, visits: null, pageviews: 0 }
}

// A region or city is keyed under its country. The country is LENGTH-PREFIXED:
// values come straight from the customer's file and may contain any character,
// so a plain separator could make two different places collide.
function placeKey(parent: string, value: string): string {
  return `${parent.length}\u0000${parent}${value}`
}

function unplaceKey(k: string): [parent: string, value: string] {
  const sep = k.indexOf('\u0000')
  const len = Number(k.slice(0, sep))
  return [k.slice(sep + 1, sep + 1 + len), k.slice(sep + 1 + len)]
}

function dimensionRow(date: string, dimension: Dimension, parent: string, value: string, b: Bucket): DimensionRow {
  return { date, dimension, parent, value, visitors: visitorsOf(b), visits: visitsOf(b), pageviews: b.pageviews }
}

function acquisitionRow(date: string, a: RawAcquisition, b: Bucket): AcquisitionRow {
  return {
    date,
    referrer: a.referrer,
    utm_source: a.utm_source,
    utm_medium: a.utm_medium,
    utm_campaign: a.utm_campaign,
    src_source: a.src_source,
    src_medium: a.src_medium,
    src_campaign: a.src_campaign,
    src_channel_group: a.src_channel_group,
    visitors: visitorsOf(b),
    visits: visitsOf(b),
    pageviews: b.pageviews,
  }
}
