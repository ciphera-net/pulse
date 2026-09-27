// ─── Cardinality caps and the history window, shared by both folds ────────
//
// M2-k: per day and dimension at most 1,000 distinct values, and per day at
// most 1,000 acquisition tuples; everything past that folds into a real
// `(other)` row, which is kept (§3.4), never dropped.
//
// 🔑 The 1,000 counts NAMED values only; the `(other)` row comes on top of
// them. That is the server's reading (§3.12b "Build amendments", 27-09-2026:
// "1,000 named values per (day, dimension) plus the `(other)` row", and the
// same for acquisition tuples), and the client caps exactly as the server
// does, so the server never has to fold a batch again. When a group has more
// than 1,000 named values, the 1,000 highest-ranked are kept and the rest are
// summed into `(other)`: a group is at most 1,001 rows.
//
// A source's own literal `(other)` is never counted as a named value. Within
// the cap it is sent as the source's row, the group's one `(other)`; when the
// group overflows it is summed into the one `(other)` row with everything
// else, so there is never a second row under that name.

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
 * Splits an overflowing group. Returns null when the group has at most `cap`
 * named values (keep every item as it is, a source's own `(other)` included);
 * otherwise the `cap` named items to keep and the items to fold into
 * `(other)`: the rest of the named ones, and any `(other)` the source sent.
 */
export function capGroup<T>(
  items: readonly T[],
  cap: number,
  rank: (item: T) => RankKey,
  isOther: (item: T) => boolean,
): { kept: T[]; folded: T[] } | null {
  // No more items than the cap means no more named values than the cap.
  if (items.length <= cap) return null
  const others: T[] = []
  const ranked: { item: T; key: RankKey }[] = []
  for (const item of items) {
    if (isOther(item)) others.push(item)
    else ranked.push({ item, key: rank(item) })
  }
  if (ranked.length <= cap) return null
  ranked.sort((a, b) => compareRank(a.key, b.key))
  const kept = ranked.slice(0, cap).map((r) => r.item)
  const folded = ranked.slice(cap).map((r) => r.item)
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
