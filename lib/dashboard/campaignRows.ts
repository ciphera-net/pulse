/**
 * The Campaigns tab's rows for one of its five views (moved out of Sources.tsx 15-11-2026, when the Source view
 * learned to merge).
 *
 * The campaigns read answers one row for each combination of the five UTM values. A view adds them up by ONE of
 * the five. Four views draw the stored value itself (a medium, a campaign, a term, a content), so the stored value
 * is the row. The Source view draws the BRAND the stored value stands for, with the brand's mark
 * (getReferrerDisplayName, the Referrers tab's own): `x`, `X` and `twitter` all read "X". There the row is the
 * brand, and its parts are added by the rule of lib/dashboard/sameRows.ts. Before this the view drew one row for
 * each stored spelling, so one brand could stand in the list two or three times.
 *
 * Pure, so the rows are tested without a block around them.
 */
import type { CampaignStat } from '@/lib/api/stats'
import { getReferrerDisplayName } from '@/lib/utils/icons'
import { addRowCounts, groupSameRows, leadingPart } from '@/lib/dashboard/sameRows'

export type UtmDimension = 'source' | 'medium' | 'campaign' | 'term' | 'content'

export interface CampaignRow {
  /** The stored value the row is drawn from: of a merged row, its most visited part's. */
  name: string
  /** Every stored value the row stands for. A press on the row filters by all of them. */
  names: string[]
  visitors: number
  pageviews: number
  bounce_rate: number | null
  avg_duration: number | null
}

/** What a row of this view reads: the brand for a source, the stored value for the other four. */
export function campaignRowLabel(dimension: UtmDimension, name: string): string {
  return dimension === 'source' ? getReferrerDisplayName(name) : name
}

export function campaignViewRows(rows: readonly CampaignStat[], dimension: UtmDimension): CampaignRow[] {
  // One row for each thing a reader can tell apart. The counts are taken over every combination under it at
  // once, so a rate is weighted by exactly the visitors that carry one.
  return groupSameRows(rows.filter((row) => row[dimension]), (row) => campaignRowLabel(dimension, row[dimension]))
    .map((parts) => {
      const stored = groupSameRows(parts, (part) => part[dimension])
        .map((same) => ({ name: same[0][dimension], ...addRowCounts(same) }))
      return { ...addRowCounts(parts), name: leadingPart(stored).name, names: stored.map((value) => value.name) }
    })
    .sort((a, b) => b.visitors - a.visitors || b.pageviews - a.pageviews)
}
