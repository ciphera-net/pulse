'use client'

import { useMemo } from 'react'
import { scaleLinear, scaleTime } from 'd3-scale'
import { curveMonotoneX } from 'd3-shape'
import { AreaClosed, LinePath, ParentSize } from '@/lib/charts/primitives'
import { useBingOverview, useBingDailyTotals } from '@/lib/swr/dashboard'
import { UpdatingChip } from '@/components/ui/UpdatingChip'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { guardedPctChange } from '@/lib/utils/pctChange'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// The Bing view of the Search tab.
//
// THREE METRICS, NOT SIX, AND THAT IS THE HONEST SHAPE. Bing's daily endpoint
// returns clicks and impressions and nothing else — no average position, and no
// per-query rows. The Google panel's other rails are not "missing" here; they do
// not exist upstream. Rendering ghosted placeholders for them would imply data
// that is coming, so the panel is simply smaller and says why.
//
// ⚠️ THE DAYS ARE BING'S, IN BING'S TIMEZONE. The API returns WCF dates carrying
// a Pacific offset, stored verbatim by the backend (migration 134). These points
// therefore must NOT be visually aligned against the Google series as though the
// two shared a calendar — they can differ by up to 24 hours. That is why this is
// a separate panel behind an engine toggle rather than an overlay on Google's
// chart, which would draw a comparison the data cannot support.
// ---------------------------------------------------------------------------

type Metric = 'clicks' | 'impressions' | 'ctr'

const METRICS: { key: Metric; label: string }[] = [
  { key: 'clicks', label: 'Clicks' },
  { key: 'impressions', label: 'Impressions' },
  { key: 'ctr', label: 'CTR' },
]

function formatValue(metric: Metric, value: number): string {
  if (metric === 'ctr') return `${(value * 100).toFixed(1)}%`
  return value.toLocaleString()
}

export default function BingPanel({
  siteId,
  dateRange,
}: {
  siteId: string
  dateRange: { start: string; end: string }
}) {
  const {
    data: overviewData,
    isValidating: overviewValidating,
    error: overviewError,
    mutate: retryOverview,
  } = useBingOverview(siteId, dateRange.start, dateRange.end)

  const {
    data: dailyData,
    error: dailyError,
  } = useBingDailyTotals(siteId, dateRange.start, dateRange.end)

  const overview = overviewData?.overview
  const daily = useMemo(() => dailyData?.daily_totals ?? [], [dailyData])

  const series = useMemo(
    () =>
      daily.map(row => ({
        // * Parsed as a plain calendar date. The backend already resolved Bing's offset into the
        // * day Bing meant, so no further timezone maths belongs here — doing any would re-shift
        // * a date that is already correct.
        date: new Date(`${row.date}T00:00:00`),
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
      })),
    [daily],
  )

  if (overviewError || dailyError) {
    return (
      <ErrorCard
        title="Couldn't load Bing data"
        description="The Bing Webmaster request failed for this period. Your data is safe — this is a loading problem."
        onRetry={() => { void retryOverview() }}
      />
    )
  }

  if (!overview) return null

  const current: Record<Metric, number> = {
    clicks: overview.total_clicks,
    impressions: overview.total_impressions,
    ctr: overview.ctr,
  }
  const previous: Record<Metric, number> = {
    clicks: overview.prev_total_clicks,
    impressions: overview.prev_total_impressions,
    ctr: overview.prev_ctr,
  }

  return (
    <div className="relative">
      <UpdatingChip active={overviewValidating && !!overview} className="-top-1 right-0" />

      <div className="flex rounded-none border border-border bg-card">
        {/* Metric rails */}
        <div className="hidden w-48 shrink-0 flex-col border-r border-border sm:flex">
          {METRICS.map(({ key, label }) => {
            // * The base is previous IMPRESSIONS for every metric, not the metric's own previous
            // * value. guardedPctChange suppresses the comparison below minBase (10), and
            // * impressions are the denominator that makes any of these meaningful: "CTR doubled"
            // * off 3 impressions is noise, and Bing volumes are low enough that this guard will
            // * genuinely fire. A suppressed comparison renders as nothing, which is the honest
            // * output — not 0%.
            const pct = guardedPctChange(current[key], previous[key], previous.impressions)
            return (
              <div
                key={key}
                className="flex flex-1 flex-col justify-center border-t border-border px-4 py-4 first:border-t-0"
              >
                <span className="text-sm text-neutral-400">{label}</span>
                <span className="mt-0.5 text-xl font-semibold text-white">
                  {key === 'ctr' ? (
                    formatValue(key, current[key])
                  ) : (
                    <AnimatedNumber value={current[key]} format={(v) => Math.round(v).toLocaleString()} />
                  )}
                </span>
                {pct?.type === 'pct' && (
                  <span
                    className={cn(
                      'mt-0.5 text-xs tabular-nums',
                      pct.value > 0 ? 'text-emerald-400' : pct.value < 0 ? 'text-destructive' : 'text-neutral-500',
                    )}
                  >
                    {pct.value > 0 ? '+' : ''}
                    {pct.value.toFixed(1)}%
                  </span>
                )}
                {pct?.type === 'new' && (
                  <span className="mt-0.5 text-xs text-neutral-500">New</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Chart strips */}
        <div className="flex min-h-[260px] flex-1 flex-col">
          {METRICS.map(({ key }) => (
            <div key={key} className="flex-1 border-t border-border first:border-t-0">
              {series.length > 1 ? (
                <ParentSize>
                  {({ width, height }: { width: number; height: number }) => {
                    if (width < 10 || height < 10) return null
                    // * Plain d3-scale chained API, matching InstrumentPanel. Not the visx object
                    // * signature — this project imports the real d3-scale.
                    const xScale = scaleTime()
                      .domain([series[0].date, series[series.length - 1].date])
                      .range([0, width])
                    // * The floor keeps a flat-zero series from collapsing the domain to [0,0],
                    // * which produces a NaN scale and an invisible chart rather than a flat line.
                    const max = Math.max(...series.map(d => d[key]), key === 'ctr' ? 0.0001 : 1)
                    const yScale = scaleLinear().domain([0, max]).range([height - 6, 6])
                    return (
                      <svg width={width} height={height}>
                        <AreaClosed
                          data={series}
                          x={(p) => xScale(p.date)}
                          y={(p) => yScale(p[key])}
                          yScale={yScale}
                          curve={curveMonotoneX}
                          fill="currentColor"
                          className="text-brand-orange/15"
                        />
                        <LinePath
                          data={series}
                          x={(p) => xScale(p.date)}
                          y={(p) => yScale(p[key])}
                          curve={curveMonotoneX}
                          stroke="currentColor"
                          strokeWidth={1.5}
                          className="text-brand-orange"
                        />
                      </svg>
                    )
                  }}
                </ParentSize>
              ) : (
                // * One point cannot be a line. Saying so beats an empty box that reads as broken.
                <div className="flex h-full items-center justify-center">
                  <span className="text-xs text-neutral-600">
                    {series.length === 0 ? 'No Bing data for this period' : 'Not enough days to chart'}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* The limit, stated where someone would otherwise go looking for the missing tables. */}
      <p className="mt-2 text-xs text-neutral-500">
        Site totals only. Bing&rsquo;s API does not expose per-query data by date, so there are no
        query or page tables for this engine. Days are bucketed in Bing&rsquo;s own timezone and may
        differ from Google&rsquo;s by up to a day.
      </p>
    </div>
  )
}
