/**
 * A list never draws the same row twice (15-11-2026).
 *
 * A row is what a reader can tell apart: what it reads, with the mark drawn beside it. Wherever a list derives
 * that from the stored value (a brand for a source, a link without its scheme, a capitalised name), two stored
 * values can draw one and the same row: `utm_source=x` and `utm_source=twitter` both read "X". The Campaigns
 * tab's Source view grouped by the stored value and labelled by the brand, so it drew such a pair as two rows,
 * each with its own count, while the Referrers tab beside it had always merged them.
 *
 * The rule: a list groups its rows by what each one READS AS, the text it draws, and never by the stored value
 * alone. This module does the grouping. A list hands it the function it labels a row with, so the grouping and
 * the label cannot drift apart. components/dashboard/__tests__/no-row-twice.test.tsx holds the rule for every
 * block that draws dimension rows, and fails when a new block is not on its list.
 *
 * What a merged row counts: its parts added up. Visitors are added too, as the Referrers tab has always done for
 * its merged rows (mergeReferrersByDisplayName in lib/utils/icons.tsx): a visitor who arrived under two spellings
 * on one day is in both parts. A rate is the mean of the parts that carry one, weighted by their visitors; a part
 * with no rate adds no weight, so it cannot pull the mean toward zero.
 */

/** Rows grouped by what each reads as, in the order each reading first appears. The parts keep their order. */
export function groupSameRows<T>(rows: readonly T[], readsAs: (row: T) => string): T[][] {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const key = readsAs(row)
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }
  return [...groups.values()]
}

/** What a dimension row counts. */
export interface RowCounts {
  pageviews: number
  visitors?: number
  bounce_rate?: number | null
  avg_duration?: number | null
}

/** The counts of one row made of `parts`. */
export function addRowCounts(parts: readonly RowCounts[]): { pageviews: number; visitors: number; bounce_rate: number | null; avg_duration: number | null } {
  let pageviews = 0
  let visitors = 0
  let bounceWeighted = 0
  let bounceBase = 0
  let durationWeighted = 0
  let durationBase = 0
  for (const part of parts) {
    const partVisitors = part.visitors ?? 0
    pageviews += part.pageviews
    visitors += partVisitors
    if (part.bounce_rate != null && partVisitors > 0) {
      bounceWeighted += part.bounce_rate * partVisitors
      bounceBase += partVisitors
    }
    if (part.avg_duration != null && partVisitors > 0) {
      durationWeighted += part.avg_duration * partVisitors
      durationBase += partVisitors
    }
  }
  return {
    pageviews,
    visitors,
    bounce_rate: bounceBase > 0 ? bounceWeighted / bounceBase : null,
    avg_duration: durationBase > 0 ? durationWeighted / durationBase : null,
  }
}

/** The part a merged row is drawn from: the most visitors, then the most pageviews, then the first. */
export function leadingPart<T extends RowCounts>(parts: readonly T[]): T {
  let lead = parts[0]
  for (const part of parts) {
    const more = (part.visitors ?? 0) - (lead.visitors ?? 0) || part.pageviews - lead.pageviews
    if (more > 0) lead = part
  }
  return lead
}

/**
 * A list's rows with every set that reads the same made one row.
 *
 * A row that reads like no other comes back as it was, the same object, so a list with nothing to merge is
 * untouched. A merged row is its leading part with the counts of all parts, plus whatever `also` adds (the stored
 * values of its parts, so a press on the row filters by all of them). The order is by visitors, then pageviews,
 * as every dimension list is.
 */
export function mergeSameRows<T extends RowCounts>(
  rows: readonly T[],
  readsAs: (row: T) => string,
  also?: (parts: readonly T[]) => Partial<T>,
): T[] {
  const groups = groupSameRows(rows, readsAs)
  if (groups.length === rows.length) return also ? rows.map((row) => ({ ...row, ...also([row]) })) : [...rows]
  return groups
    .map((parts) => (parts.length === 1 && !also
      ? parts[0]
      : { ...leadingPart(parts), ...(parts.length > 1 ? addRowCounts(parts) : {}), ...(also ? also(parts) : {}) } as T))
    .sort((a, b) => (b.visitors ?? 0) - (a.visitors ?? 0) || b.pageviews - a.pageviews)
}
