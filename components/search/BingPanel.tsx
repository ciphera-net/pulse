'use client'

import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQueryParamsWriter } from '@/lib/hooks/useQueryParamsWriter'
import { useBingOverview, useBingDailyTotals } from '@/lib/swr/dashboard'
import { guardedPctChange } from '@/lib/utils/pctChange'
import type { GSCDailyTotal } from '@/lib/api/gsc'
import { InstrumentCore, type InstrumentRow } from './InstrumentPanel'
import {
  rollupSeries,
  parseActiveSubset,
  serializeActiveSubset,
  type Granularity,
  type MetricKey,
} from './searchMetrics'

// ---------------------------------------------------------------------------
// The Bing view of the Search tab — the SAME instrument as Google's, rendered
// through InstrumentCore with the metric set Bing's API honestly has.
//
// THREE METRICS, NOT FOUR, AND THAT IS THE HONEST SHAPE. Bing's daily endpoint
// returns clicks and impressions and nothing else — no average position, and no
// per-query rows. The Google panel's other rails are not "missing" here; they do
// not exist upstream. The panel is the same device, simply shorter, and the
// caption below says why.
//
// ⚠️ THE DAYS ARE BING'S, IN BING'S TIMEZONE. The API returns WCF dates carrying
// a Pacific offset, stored verbatim by the backend (migration 134). These points
// therefore must NOT be visually aligned against the Google series as though the
// two shared a calendar — they can differ by up to 24 hours. That is why this is
// a separate panel behind the engine control rather than an overlay on Google's
// chart, which would draw a comparison the data cannot support.
// ---------------------------------------------------------------------------

const BING_METRICS: MetricKey[] = ['clicks', 'impressions', 'ctr']
const BING_DEFAULT_ACTIVE: MetricKey[] = ['clicks', 'impressions']

export default function BingPanel({
  siteId,
  dateRange,
  granularity,
}: {
  siteId: string
  dateRange: { start: string; end: string }
  granularity: Granularity
}) {
  const searchParams = useSearchParams()
  const write = useQueryParamsWriter()

  // * ?bm= mirrors Google's ?m= grammar on Bing's own metric set, so a shared
  // * link restores the same strips for either engine independently.
  const active = parseActiveSubset(searchParams.get('bm'), BING_METRICS, BING_DEFAULT_ACTIVE)
  const toggleMetric = useCallback(
    (key: MetricKey) => {
      const next = active.includes(key) ? active.filter((k) => k !== key) : [...active, key]
      if (next.length === 0) return // at least one strip stays
      write({ bm: serializeActiveSubset(next, BING_METRICS, BING_DEFAULT_ACTIVE) })
    },
    [active, write],
  )

  const {
    data: overviewData,
    isValidating: overviewValidating,
    error: overviewError,
    mutate: retryOverview,
  } = useBingOverview(siteId, dateRange.start, dateRange.end)

  const {
    data: dailyData,
    error: dailyError,
    isLoading: dailyLoading,
    mutate: retryDaily,
  } = useBingDailyTotals(siteId, dateRange.start, dateRange.end)

  const overview = overviewData?.overview

  // * Bing rows carry no position; rollupSeries already treats an absent
  // * position as "no day in the bucket has one" and emits null, which is
  // * exactly the honest value. The dates are plain calendar days the backend
  // * already resolved out of Bing's WCF offset — no timezone maths here.
  const series = useMemo(
    () => rollupSeries((dailyData?.daily_totals ?? []) as unknown as GSCDailyTotal[], granularity),
    [dailyData, granularity],
  )

  if (!overview) return null

  // * The base is previous IMPRESSIONS for every metric, not the metric's own
  // * previous value. guardedPctChange suppresses the comparison below minBase
  // * (10), and impressions are the denominator that makes any of these
  // * meaningful: "CTR doubled" off 3 impressions is noise, and Bing volumes
  // * are low enough that this guard will genuinely fire. A suppressed
  // * comparison renders as nothing, which is the honest output — not 0%.
  const current: Record<string, number> = {
    clicks: overview.total_clicks,
    impressions: overview.total_impressions,
    ctr: overview.ctr,
  }
  const previous: Record<string, number> = {
    clicks: overview.prev_total_clicks,
    impressions: overview.prev_total_impressions,
    ctr: overview.prev_ctr,
  }
  const rows: InstrumentRow[] = BING_METRICS.map((key) => ({
    key,
    value: current[key],
    delta: guardedPctChange(current[key], previous[key], previous.impressions),
  }))

  return (
    <div>
      <InstrumentCore
        rows={rows}
        series={series}
        granularity={granularity}
        rangeEnd={dateRange.end}
        active={active}
        onToggle={toggleMetric}
        isValidating={overviewValidating && !!overview}
        isLoading={dailyLoading}
        error={!!(overviewError || dailyError)}
        onRetry={() => { void retryOverview(); void retryDaily() }}
        errorTitle="Couldn't load Bing data"
        emptyTitle="No Bing data in this period."
        emptyHint="Bing syncs daily site totals — try a wider range."
        // * One registry entry, all three rows — Bing's daily endpoint returns
        // * clicks/impressions/CTR as one site-level payload, not three
        // * independently-sourced metrics the way Google's four are.
        termFor={() => 'bing_clicks_impressions_ctr'}
      />

      {/* The limit, stated where someone would otherwise go looking for the missing tables. */}
      <p className="mt-2 text-xs text-neutral-500">
        Site totals only. Bing&rsquo;s API does not expose per-query data by date, so there are no
        query or page tables for this engine. Days are bucketed in Bing&rsquo;s own timezone and may
        differ from Google&rsquo;s by up to a day.
      </p>
    </div>
  )
}
