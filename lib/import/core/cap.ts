// ─── Cardinality caps and the history window, shared by both folds ────────
//
// M2-k: per day and dimension at most 1,000 distinct values, and per day at
// most 1,000 acquisition tuples; everything past that folds into a real
// `(other)` row, which is kept (§3.4), never dropped.
//
// 🔑 "At most 1,000" counts the `(other)` row itself. When a group overflows,
// the 999 highest-ranked values are kept and the rest become the thousandth.
// The server enforces the same cap (both sides, M2-k), and a batch that already
// holds exactly 1,000 values per group is inside it under either reading of
// whether `(other)` counts.
//
// A source's own literal `(other)` is always folded into the one `(other)` row
// when a group overflows, so there is never a second row under that name.

import type { SkipReason } from './skipped'

export const DIMENSION_VALUE_CAP = 1000
export const ACQUISITION_TUPLE_CAP = 1000
export const OTHER = '(other)'

export interface RankKey {
  visitors: number
  pageviews: number | null
  visits: number | null
  /** Breaks ties so the kept set is the same for the same input, every time. */
  tiebreak: string
}

/** Highest visitors first, then pageviews, then visits, then the key in code-unit order. */
export function compareRank(a: RankKey, b: RankKey): number {
  if (a.visitors !== b.visitors) return b.visitors - a.visitors
  const ap = a.pageviews ?? -1
  const bp = b.pageviews ?? -1
  if (ap !== bp) return bp - ap
  const av = a.visits ?? -1
  const bv = b.visits ?? -1
  if (av !== bv) return bv - av
  return a.tiebreak < b.tiebreak ? -1 : a.tiebreak > b.tiebreak ? 1 : 0
}

/**
 * Splits an overflowing group. Returns null when the group is within the cap
 * (keep every item as it is); otherwise the `cap - 1` items to keep and the
 * items to fold into `(other)`.
 */
export function capGroup<T>(
  items: readonly T[],
  cap: number,
  rank: (item: T) => RankKey,
  isOther: (item: T) => boolean,
): { kept: T[]; folded: T[] } | null {
  if (items.length <= cap) return null
  const others: T[] = []
  const ranked: { item: T; key: RankKey }[] = []
  for (const item of items) {
    if (isOther(item)) others.push(item)
    else ranked.push({ item, key: rank(item) })
  }
  ranked.sort((a, b) => compareRank(a.key, b.key))
  const kept = ranked.slice(0, cap - 1).map((r) => r.item)
  const folded = ranked.slice(cap - 1).map((r) => r.item)
  for (const o of others) folded.push(o)
  return { kept, folded }
}

/**
 * The days the browser may send, and the reason a day outside them is
 * skipped on each side. Built by the orchestrator from the upload window
 * (or, on a resume, from the stored import's own range).
 */
export interface Clip {
  from: string
  through: string
  before: SkipReason
  after: SkipReason
}

/** The skip reason for `date`, or null when it is inside the clip. */
export function clipReason(clip: Clip | null, date: string): SkipReason | null {
  if (!clip) return null
  if (date < clip.from) return clip.before
  if (date > clip.through) return clip.after
  return null
}

/** Nullable sum, the same rule the server's fold uses: null only when both are. */
export function sumNullable(a: number | null, b: number | null): number | null {
  if (a === null) return b
  if (b === null) return a
  return a + b
}
