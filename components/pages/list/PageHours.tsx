'use client'

import { useMemo } from 'react'
import { SkeletonLine } from '@/components/skeletons'
import { pairPreviousSeries } from '@/lib/dashboard/previousSeries'
import { useDailyStats } from '@/lib/swr/dashboard'
import { parseSiteWallClock } from '@/lib/utils/formatDate'
import PageTrend, { type TrendPoint } from './PageTrend'

// ---------------------------------------------------------------------------
// One page's views over ONE day (Today, Yesterday, or a day picked from the calendar), by the hour, inside its
// opened row on the Pages page (ruling R81, 17-11-2026: a day is drawn as the dashboard draws it).
//
// It is the dashboard's own series for a day (lib/swr/dashboard useDailyStats, the read behind the deck's chart and
// its dashed line), filtered to the page: hours, or minutes while the day is younger than three hours, and the same
// buckets of the day before paired place by place (lib/dashboard/previousSeries). The pages read itself returns one
// figure a day for a page, which is why it cannot draw a day.
// ---------------------------------------------------------------------------

export interface PageHoursProps {
  siteId: string
  /** The day (the range's start and end are the same date). */
  day: string
  apiPeriod?: string
  /** The page's filters with this page added (`page is <path>`), as the dashboard sends them. */
  filters: string
  /** The day before it, where the page compares. */
  prevDay?: string
  /** The day is today: its last bucket is still being counted. */
  live: boolean
  /** Minutes while today is younger than three hours, as the dashboard draws it; hours otherwise. */
  bucket: 'hour' | 'minute'
  /** The first day the site has data for: a partner before it carries no value. */
  floor?: string | null
}

export default function PageHours({ siteId, day, apiPeriod, filters, prevDay, live, bucket, floor }: PageHoursProps) {
  const { data: now, isLoading } = useDailyStats(siteId, day, day, bucket, filters, apiPeriod)
  // Minute buckets are not compared, as on the dashboard: the day before is asked for by the hour only.
  const compares = bucket === 'hour' && Boolean(prevDay)
  const { data: before } = useDailyStats(siteId, compares ? prevDay! : '', compares ? prevDay! : '', 'hour', filters)

  const data = useMemo<TrendPoint[]>(() => {
    if (!now) return []
    const prev = compares && before && before.length > 0 && prevDay ? pairPreviousSeries(now, before, day, prevDay, floor) : null
    return now.map((item, i) => {
      const p = prev?.[i] ?? null
      return {
        dateObj: parseSiteWallClock(item.date) ?? new Date(item.date),
        views: item.pageviews,
        prev: p && !p.predatesData ? p.pageviews : null,
        prevDateObj: p ? (parseSiteWallClock(p.date) ?? new Date(p.date)) : null,
        isPartial: live && i === now.length - 1,
      }
    })
  }, [now, before, compares, day, prevDay, floor, live])

  if (!now && isLoading) {
    return (
      <div className="flex h-full min-h-[200px] items-end gap-2 px-6 pb-10 pt-6" aria-hidden="true" data-page-hours="loading">
        {[36, 52, 44, 68, 58, 80, 62, 48].map((h, i) => <SkeletonLine key={i} className="flex-1" style={{ height: `${h}%` }} />)}
      </div>
    )
  }
  return (
    <div className="h-full" data-page-hours={bucket} data-page-hours-points={data.length}>
      <PageTrend data={data} bucket={bucket} drawPrev={compares && data.some((d) => d.prevDateObj !== null)} live={live} />
    </div>
  )
}
