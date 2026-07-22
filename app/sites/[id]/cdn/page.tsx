'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { scaleLinear, scaleTime } from 'd3-scale'
import { area as d3Area, curveMonotoneX } from 'd3-shape'
import { bisector } from 'd3-array'
import { CountryFlag } from '@/components/ui/CountryFlag'
import { hasFlag } from '@/lib/flags'

import { DURATION_BASE, EASE_APPLE } from '@/lib/motion'
import { formatNumber } from '@/lib/utils/format'
import { extractCountryCode, extractCity } from '@/lib/utils/bunnyDatacenter'
import { formatDate, formatDateShort } from '@/lib/utils/formatDate'
import { guardedPctChange, type PctChangeResult } from '@/lib/utils/pctChange'
import { useUrlDateRange, type Period } from '@/lib/hooks/useUrlDateRange'
import { useSite, useBunnyStatus, useBunnyOverview, useBunnyDailyStats, useBunnyTopCountries } from '@/lib/swr/dashboard'
import { LinePath, ParentSize, localPoint } from '@/lib/charts/primitives'
import type { BunnyGeoRow } from '@/lib/api/bunny'

import DateRangePicker from '@/components/ui/DateRangePicker'
import { AreaChart, Area, Grid, XAxis, YAxis, ChartTooltip } from '@/components/ui/area-chart'
import { BarChart, Bar, Grid as BarGrid, BarXAxis, BarValueAxis, ChartTooltip as BarTooltip } from '@/components/ui/bar-chart'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { UpdatingChip } from '@/components/ui/UpdatingChip'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { SyncStatusLine } from '@/components/integrations/SyncStatusLine'
import { RowBar } from '@/components/search/rowPrimitives'
import { CDNSkeleton } from '@/components/skeletons'
import { CloudArrowUp, CloudArrowDown, ChartBar, Warning, Gauge, GlobeHemisphereWest, ArrowSquareOut } from '@phosphor-icons/react'

const MapView = dynamic(() => import('@/components/dashboard/MapView'), { ssr: false })

// ─── Palette (color budget: orange = cache doing its job, neutral = origin/cost,
// red = errors only; no orange in the errors chart) ────────────────────────────
const CACHED = '#FD5E0F'
const ORIGIN = '#737373'
const UNCACHED = '#525252'
const ERR_3XX = '#737373'
const ERR_4XX = 'rgba(248,113,113,0.7)'
const ERR_5XX = '#ef4444'
const TOTAL_DOT = '#a3a3a3'

// ─── Helpers ────────────────────────────────────────────────────

/** Flag icon for an alpha-2 country code, or null when unavailable. */
function getFlagIcon(code: string) {
  if (!code || !hasFlag(code)) return null
  return <CountryFlag code={code} className="h-3.5 w-5 shrink-0 rounded-none" />
}

/** Map datacenter entries to country centroids for the dotted map, summing
 * bandwidth per country. Several Bunny datacenters can resolve to the same
 * country (e.g. two US PoPs); mapping 1:1 produced duplicate country entries
 * and the map kept only one, undercounting multi-datacenter countries. */
function mapToCountryCentroids(data: BunnyGeoRow[]): Array<{ country: string; pageviews: number }> {
  const byCountry = new Map<string, number>()
  for (const row of data) {
    const country = extractCountryCode(row.country_code)
    if (country === '') continue
    byCountry.set(country, (byCountry.get(country) ?? 0) + row.bandwidth)
  }
  return Array.from(byCountry, ([country, pageviews]) => ({ country, pageviews }))
}

/** Bytes → "1.5 GB". Kept local — CDN is its only consumer. */
function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / Math.pow(1024, i)
  return value.toFixed(i === 0 ? 0 : 1) + ' ' + units[i]
}

const evenTicks = (min: number, max: number, count: number) =>
  Array.from({ length: count }, (_, i) => min + (max - min) * (i / (count - 1)))

const cascade = (delay: number) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: DURATION_BASE, ease: EASE_APPLE, delay },
})

interface BandwidthPoint {
  date: Date
  total: number
  cached: number
  origin: number
  hitRate: number
}

// ─── Page ───────────────────────────────────────────────────────

export default function CDNPage() {
  const params = useParams()
  const siteId = params.id as string

  const { period, dateRange, setPeriod, shiftPeriod } = useUrlDateRange()

  const { data: bunnyStatus } = useBunnyStatus(siteId)
  const connected = bunnyStatus?.connected
  const { data: site } = useSite(siteId)
  const {
    data: overview,
    isLoading: overviewLoading,
    isValidating: overviewValidating,
    error: overviewError,
    mutate: mutateOverview,
  } = useBunnyOverview(siteId, dateRange.start, dateRange.end)
  const {
    data: dailyStats,
    isValidating: dailyValidating,
    error: dailyError,
    mutate: mutateDaily,
  } = useBunnyDailyStats(siteId, dateRange.start, dateRange.end)
  const {
    data: topCountries,
    isValidating: countriesValidating,
    error: countriesError,
    mutate: mutateCountries,
  } = useBunnyTopCountries(siteId, dateRange.start, dateRange.end)

  // Chart series — memoized before any early return so hook order is stable.
  const daily = useMemo(() => dailyStats?.daily_stats ?? [], [dailyStats])
  const bandwidthPoints = useMemo<BandwidthPoint[]>(
    () =>
      daily.map((d) => {
        const total = d.bandwidth_used
        const cached = d.bandwidth_cached
        // Origin = the bandwidth the CDN could NOT serve from cache (the cost).
        const origin = Math.max(0, total - cached)
        // Per-day hit rate is request-based, matching the "Cache hit rate" KPI's
        // definition — a consistent meaning of "hit rate" page-wide.
        const hitRate = d.requests_served > 0 ? (d.requests_cached / d.requests_served) * 100 : 0
        return { date: new Date(d.date + 'T00:00:00'), total, cached, origin, hitRate }
      }),
    [daily],
  )
  const requestData = useMemo(
    () =>
      daily.map((d) => ({
        date: formatDateShort(new Date(d.date + 'T00:00:00')),
        cached: d.requests_cached,
        uncached: Math.max(0, d.requests_served - d.requests_cached),
        served: d.requests_served,
      })),
    [daily],
  )
  const errorData = useMemo(
    () =>
      daily.map((d) => ({
        date: formatDateShort(new Date(d.date + 'T00:00:00')),
        '3xx': d.error_3xx,
        '4xx': d.error_4xx,
        '5xx': d.error_5xx,
      })),
    [daily],
  )

  useEffect(() => {
    const domain = site?.domain
    document.title = domain ? `CDN · ${domain} | Pulse` : 'CDN | Pulse'
  }, [site?.domain])

  // ─── Route-level state: skeleton only on the very first load ──
  if (bunnyStatus === undefined || (connected && overview === undefined && overviewLoading)) {
    return <CDNSkeleton />
  }

  // ─── Not connected state ──────────────────────────────────
  if (bunnyStatus && !bunnyStatus.connected) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 pb-8">
        {/* * Same page header as the connected view — without it this tab was
         * the only one with no h1 and read as a different app. */}
        <div className="mb-8">
          <h1 className="text-lg font-semibold text-white mb-1">CDN Analytics</h1>
          <p className="text-sm text-neutral-400">BunnyCDN performance, bandwidth, and cache metrics</p>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-none bg-neutral-800 p-5 mb-6">
            <CloudArrowUp size={40} className="text-neutral-500" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Connect BunnyCDN</h2>
          <p className="text-sm text-neutral-400 max-w-md mb-6">
            Monitor your CDN performance including bandwidth usage, cache hit rates, request volumes, and geographic distribution.
          </p>
          <Link
            href="/settings/site/integrations"
            className="inline-flex h-10 items-center gap-2 rounded-none bg-brand-orange-button px-5 text-sm font-medium text-white transition-colors ease-apple hover:bg-brand-orange-button-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
          >
            Connect in Settings
            <ArrowSquareOut size={16} weight="bold" />
          </Link>
        </div>
      </div>
    )
  }

  // ─── Connected — main view ────────────────────────────────
  const countries = topCountries?.countries ?? []
  const totalBandwidth = countries.reduce((sum, row) => sum + row.bandwidth, 0)
  const maxBandwidth = countries.reduce((max, row) => Math.max(max, row.bandwidth), 0)
  const anyValidating = overviewValidating || dailyValidating || countriesValidating

  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 pb-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-white">CDN Analytics</h1>
          <p className="mt-1 text-sm text-neutral-400">BunnyCDN performance, bandwidth, and cache metrics</p>
          {bunnyStatus && (
            <SyncStatusLine
              status={bunnyStatus.status}
              lastSyncedAt={bunnyStatus.last_synced_at}
              errorMessage={bunnyStatus.error_message}
              settingsHref="/settings/site/integrations"
            />
          )}
        </div>
        <DateRangePicker
          period={period}
          dateRange={dateRange}
          onPeriodChange={(p) => setPeriod(p as Period)}
          onDateRangeChange={(range) => setPeriod('custom', range)}
          onShift={shiftPeriod}
        />
      </div>

      {/* Content — one chip covers range changes, the ErrorCard covers failures */}
      <div className="relative">
        <UpdatingChip active={anyValidating && !!overview} className="-top-1 right-0" />
        {overviewError ? (
          <ErrorCard
            title="Couldn't load CDN data"
            description="The BunnyCDN request failed for this period. Your data is safe — this is a loading problem."
            onRetry={() => { void mutateOverview() }}
          />
        ) : overview ? (
          <>
            {/* KPI band */}
            <motion.div {...cascade(0)} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <KpiCard
                label="Bandwidth"
                value={overview.total_bandwidth}
                format={formatBytes}
                delta={<PctDelta change={guardedPctChange(overview.total_bandwidth, overview.prev_total_bandwidth, overview.prev_total_bandwidth)} />}
              />
              <KpiCard
                label="Requests"
                value={overview.total_requests}
                format={(v) => formatNumber(Math.round(v))}
                delta={<PctDelta change={guardedPctChange(overview.total_requests, overview.prev_total_requests, overview.prev_total_requests)} />}
              />
              <KpiCard
                label="Cache hit rate"
                value={overview.cache_hit_rate}
                format={(v) => `${v.toFixed(1)}%`}
                // Delta in POINTS (difference of the two rates), not a %-of-%.
                // Suppressed when the previous window had too few requests to compare.
                delta={<PointsDelta points={overview.prev_total_requests < 10 ? null : overview.cache_hit_rate - overview.prev_cache_hit_rate} />}
              />
              <KpiCard
                label="Origin response"
                value={overview.avg_origin_response}
                format={(v) => `${v.toFixed(0)}ms`}
                // Inverted metric — a faster (lower) origin is good (green).
                delta={<PctDelta change={guardedPctChange(overview.avg_origin_response, overview.prev_avg_origin_response, overview.prev_total_requests)} invert />}
              />
              <KpiCard
                label="Errors"
                value={overview.total_errors}
                format={(v) => formatNumber(Math.round(v))}
                // Inverted metric — fewer errors is good (green).
                delta={<PctDelta change={guardedPctChange(overview.total_errors, overview.prev_total_errors, overview.prev_total_errors)} invert />}
              />
            </motion.div>

            {/* Bandwidth + Requests/Errors/Latency all read the same daily payload,
             * so a single ErrorCard covers them (no per-card duplication). */}
            {dailyError ? (
              <motion.div {...cascade(0.04)} className="mt-6">
                <ErrorCard
                  title="Couldn't load CDN charts"
                  description="The BunnyCDN daily stats request failed for this period. Your data is safe — this is a loading problem."
                  onRetry={() => { void mutateDaily() }}
                  className="rounded-none border border-border bg-card py-16"
                />
              </motion.div>
            ) : (
              <>
                {/* Bandwidth — stacked cached (orange) over origin (neutral) */}
                <motion.div {...cascade(0.04)} className="mt-6 rounded-none border border-border bg-card p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="font-mono text-xs text-neutral-500">Bandwidth</span>
                    <div className="flex items-center gap-4">
                      <LegendDot color={CACHED} label="Cached" />
                      <LegendDot color={ORIGIN} label="Origin" />
                    </div>
                  </div>
                  <div className="relative h-[280px]">
                    {bandwidthPoints.length > 0 ? (
                      <ParentSize debounceTime={10}>
                        {({ width, height }) => (width > 0 && height > 0 ? <BandwidthBody width={width} height={height} data={bandwidthPoints} /> : null)}
                      </ParentSize>
                    ) : (
                      <EmptyState
                        icon={<CloudArrowDown />}
                        title="No bandwidth data"
                        description="Bandwidth stats will appear here once your CDN starts serving traffic."
                        className="h-full"
                      />
                    )}
                  </div>
                </motion.div>

                {/* Requests · Errors · Origin latency */}
                <motion.div {...cascade(0.08)} className="mt-6 grid gap-6 lg:grid-cols-3">
                  {/* Requests — stacked cached / uncached */}
                  <div className="rounded-none border border-border bg-card p-4">
                    <span className="font-mono text-xs text-neutral-500">Requests</span>
                    <div className="mt-3">
                      {daily.length > 0 ? (
                        <BarChart
                          data={requestData}
                          xDataKey="date"
                          aspectRatio="auto"
                          className="h-[220px]"
                          margin={{ top: 16, right: 16, bottom: 40, left: 56 }}
                        >
                          <BarGrid />
                          <BarXAxis />
                          <BarValueAxis formatValue={(v) => formatNumber(Math.round(v))} />
                          <Bar dataKey="cached" stackId="req" fill={CACHED} radius={0} />
                          <Bar dataKey="uncached" stackId="req" fill={UNCACHED} radius={0} />
                          <BarTooltip
                            rows={(point) => [
                              { color: CACHED, label: 'Cached', value: formatNumber((point.cached as number) ?? 0) },
                              { color: UNCACHED, label: 'Uncached', value: formatNumber((point.uncached as number) ?? 0) },
                              { color: TOTAL_DOT, label: 'Total', value: formatNumber((point.served as number) ?? 0) },
                            ]}
                          />
                        </BarChart>
                      ) : (
                        <EmptyState
                          icon={<ChartBar />}
                          title="No request data"
                          description="Request counts will appear here once your CDN starts serving traffic."
                          className="h-[220px]"
                        />
                      )}
                    </div>
                  </div>

                  {/* Errors — 3xx neutral (redirects), 4xx/5xx red; no orange here */}
                  <div className="rounded-none border border-border bg-card p-4">
                    <span className="font-mono text-xs text-neutral-500">Errors</span>
                    <div className="mt-3">
                      {daily.length > 0 && errorData.every((d) => d['3xx'] + d['4xx'] + d['5xx'] === 0) ? (
                        <div className="flex h-[220px] items-center justify-center">
                          <p className="font-mono text-xs text-neutral-500">No errors in this period.</p>
                        </div>
                      ) : daily.length > 0 ? (
                        <BarChart
                          data={errorData}
                          xDataKey="date"
                          aspectRatio="auto"
                          className="h-[220px]"
                          margin={{ top: 16, right: 16, bottom: 40, left: 56 }}
                        >
                          <BarGrid />
                          <BarXAxis />
                          <BarValueAxis formatValue={(v) => formatNumber(Math.round(v))} />
                          <Bar dataKey="3xx" stackId="err" fill={ERR_3XX} radius={0} />
                          <Bar dataKey="4xx" stackId="err" fill={ERR_4XX} radius={0} />
                          <Bar dataKey="5xx" stackId="err" fill={ERR_5XX} radius={0} />
                          <BarTooltip
                            rows={(point) => [
                              { color: ERR_3XX, label: '3xx', value: formatNumber((point['3xx'] as number) ?? 0) },
                              { color: ERR_4XX, label: '4xx', value: formatNumber((point['4xx'] as number) ?? 0) },
                              { color: ERR_5XX, label: '5xx', value: formatNumber((point['5xx'] as number) ?? 0) },
                            ]}
                          />
                        </BarChart>
                      ) : (
                        <EmptyState
                          icon={<Warning />}
                          title="No error data"
                          description="Error rates will appear here once your CDN starts serving traffic."
                          className="h-[220px]"
                        />
                      )}
                    </div>
                  </div>

                  {/* Origin latency — single orange line */}
                  <div className="rounded-none border border-border bg-card p-4">
                    <span className="font-mono text-xs text-neutral-500">Origin latency</span>
                    <div className="mt-3">
                      {daily.length > 0 ? (
                        <AreaChart
                          data={daily as unknown as Record<string, unknown>[]}
                          xDataKey="date"
                          aspectRatio="auto"
                          className="h-[220px]"
                          margin={{ top: 16, right: 16, bottom: 40, left: 56 }}
                        >
                          <Grid />
                          <XAxis />
                          <YAxis formatValue={(v) => `${v.toFixed(0)}ms`} />
                          <Area dataKey="origin_response_time_avg" fill={CACHED} fillOpacity={0} stroke={CACHED} />
                          <ChartTooltip
                            rows={(point) => [
                              { color: CACHED, label: 'Origin latency', value: `${Math.round((point.origin_response_time_avg as number) ?? 0)}ms` },
                            ]}
                          />
                        </AreaChart>
                      ) : (
                        <EmptyState
                          icon={<Gauge />}
                          title="No latency data"
                          description="Origin response times will appear here once your CDN starts serving traffic."
                          className="h-[220px]"
                        />
                      )}
                    </div>
                  </div>
                </motion.div>
              </>
            )}

            {/* Traffic distribution — map kept, datacenter grid → ranked rows */}
            <motion.div {...cascade(0.12)} className="mt-6 rounded-none border border-border bg-card p-4">
              <span className="font-mono text-xs text-neutral-500">Traffic distribution</span>
              {countriesError ? (
                <ErrorCard
                  title="Couldn't load traffic distribution"
                  description="The BunnyCDN geographic request failed for this period. Your data is safe — this is a loading problem."
                  onRetry={() => { void mutateCountries() }}
                  className="py-16"
                />
              ) : countries.length > 0 ? (
                <>
                  <div className="mt-4 h-[360px]">
                    <MapView data={mapToCountryCentroids(countries)} formatValue={formatBytes} />
                  </div>
                  <div className="mt-6 space-y-0.5">
                    {countries.map((row) => (
                      <DistributionRow key={row.country_code} row={row} maxBandwidth={maxBandwidth} totalBandwidth={totalBandwidth} />
                    ))}
                  </div>
                </>
              ) : (
                <EmptyState
                  icon={<GlobeHemisphereWest />}
                  title="No geographic data"
                  description="Traffic distribution will appear here once your CDN starts serving traffic."
                  className="h-[360px]"
                />
              )}
            </motion.div>
          </>
        ) : null}
      </div>
    </div>
  )
}

// ─── KPI band ───────────────────────────────────────────────────

// Guarded percentage delta — arrow + magnitude, green good / red bad. Inverted
// metrics (origin latency, errors) flip which direction is good. 0% stays neutral.
function PctDelta({ change, invert = false }: { change: PctChangeResult; invert?: boolean }) {
  if (!change || change.type !== 'pct') return null
  if (change.value === 0) {
    return <span className="font-mono text-xs tabular-nums text-neutral-500">0%</span>
  }
  const up = change.value > 0
  const good = invert ? !up : up
  return (
    <span className={`text-xs font-medium tabular-nums ${good ? 'text-green-400' : 'text-red-400'}`}>
      {up ? '↑' : '↓'} {Math.abs(change.value)}%
    </span>
  )
}

// Cache-hit delta in points (pt). null = suppressed (tiny previous window).
function PointsDelta({ points }: { points: number | null }) {
  if (points === null) return null
  const rounded = Math.round(points * 10) / 10
  if (rounded === 0) {
    return <span className="font-mono text-xs tabular-nums text-neutral-500">0 pt</span>
  }
  const up = rounded > 0
  return (
    <span className={`text-xs font-medium tabular-nums ${up ? 'text-green-400' : 'text-red-400'}`}>
      {up ? '↑' : '↓'} {Math.abs(rounded).toFixed(1)} pt
    </span>
  )
}

function KpiCard({
  label,
  value,
  format,
  delta,
}: {
  label: string
  value: number
  format: (v: number) => string
  delta: React.ReactNode
}) {
  return (
    <div className="rounded-none border border-border bg-card p-4">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <span className="font-mono text-xs text-neutral-500">{label}</span>
        {delta}
      </div>
      <AnimatedNumber value={value} format={format} className="text-2xl font-semibold tabular-nums text-white" />
    </div>
  )
}

// ─── Bandwidth chart (dedicated stacked-area SVG on chart tokens) ─
// The shared <AreaChart> derives one yScale from its Area children and overlays
// them — it cannot stack. Design D9 wants a true cached-over-origin stack, so
// (like T4's SearchTrafficChart) this composes the same low-level primitives and
// tokens: cached is the filled base band (0 → cached), origin is stacked on top
// (cached → total), and the neutral outline traces the total.

const B_MARGIN = { top: 8, right: 16, bottom: 28, left: 64 }

function BandwidthBody({ width, height, data }: { width: number; height: number; data: BandwidthPoint[] }) {
  const innerWidth = width - B_MARGIN.left - B_MARGIN.right
  const innerHeight = height - B_MARGIN.top - B_MARGIN.bottom
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const xScale = useMemo(
    () => scaleTime().domain([data[0].date, data[data.length - 1].date]).range([0, Math.max(1, innerWidth)]),
    [data, innerWidth],
  )
  const yScale = useMemo(
    () =>
      scaleLinear()
        // Guard the domain against a glitch where cached briefly exceeds used.
        .domain([0, Math.max(1, ...data.map((d) => Math.max(d.total, d.cached))) * 1.1])
        .range([Math.max(1, innerHeight), 0])
        .nice(),
    [data, innerHeight],
  )
  const [yMin, yMax] = yScale.domain()
  const yTicks = useMemo(() => evenTicks(yMin, yMax, 5), [yMin, yMax])
  const xTicks = useMemo(() => {
    const n = Math.min(5, data.length)
    if (n <= 1) return data.map((_, i) => i)
    return Array.from({ length: n }, (_, k) => Math.round((k * (data.length - 1)) / (n - 1)))
  }, [data])

  const cachedPath = useMemo(
    () =>
      d3Area<BandwidthPoint>()
        .x((d) => xScale(d.date))
        .y0(yScale(0))
        .y1((d) => yScale(d.cached))
        .curve(curveMonotoneX)(data) ?? '',
    [data, xScale, yScale],
  )
  const originPath = useMemo(
    () =>
      d3Area<BandwidthPoint>()
        .x((d) => xScale(d.date))
        .y0((d) => yScale(d.cached))
        .y1((d) => yScale(d.cached + d.origin))
        .curve(curveMonotoneX)(data) ?? '',
    [data, xScale, yScale],
  )

  const bisectDate = useMemo(() => bisector<BandwidthPoint, Date>((d) => d.date).left, [])
  const handleMove = useCallback(
    (event: React.MouseEvent<SVGRectElement>) => {
      const point = localPoint(event)
      if (!point) return
      const x0 = xScale.invert(point.x - B_MARGIN.left)
      const i = bisectDate(data, x0, 1)
      const d0 = data[i - 1]
      const d1 = data[i]
      let idx = i - 1
      if (d0 && d1) idx = x0.getTime() - d0.date.getTime() > d1.date.getTime() - x0.getTime() ? i : i - 1
      setHoverIndex(Math.max(0, Math.min(data.length - 1, idx)))
    },
    [xScale, data, bisectDate],
  )

  if (innerWidth <= 0 || innerHeight <= 0) return null

  const hovered = hoverIndex != null ? data[hoverIndex] : null
  const hoverX = hovered ? xScale(hovered.date) : 0
  const tooltipX = hoverX + B_MARGIN.left
  const flip = tooltipX > width * 0.66

  return (
    <>
      <svg aria-hidden="true" width={width} height={height}>
        <g transform={`translate(${B_MARGIN.left},${B_MARGIN.top})`}>
          {/* Grid + Y axis (bytes) */}
          {yTicks.map((t, i) => (
            <g key={i}>
              <line x1={0} x2={innerWidth} y1={yScale(t)} y2={yScale(t)} stroke="var(--chart-grid)" strokeWidth={1} />
              <text
                x={-8}
                y={yScale(t)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={11}
                fill="var(--chart-axis)"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {formatBytes(t)}
              </text>
            </g>
          ))}

          {/* X axis — DD/MM */}
          {xTicks.map((idx) => (
            <text key={idx} x={xScale(data[idx].date)} y={innerHeight + 18} textAnchor="middle" fontSize={11} fill="var(--chart-axis)">
              {formatDateShort(data[idx].date)}
            </text>
          ))}

          {/* Origin band (stacked on cached) then cached base band */}
          <path d={originPath} fill={ORIGIN} fillOpacity={0.2} />
          <path d={cachedPath} fill={CACHED} fillOpacity={0.25} />

          {/* Total outline (top of origin) + cached edge */}
          <LinePath data={data} x={(d) => xScale(d.date)} y={(d) => yScale(d.cached + d.origin)} curve={curveMonotoneX} stroke={ORIGIN} strokeWidth={1.5} strokeLinecap="round" />
          <LinePath data={data} x={(d) => xScale(d.date)} y={(d) => yScale(d.cached)} curve={curveMonotoneX} stroke={CACHED} strokeWidth={2} strokeLinecap="round" />

          {hovered && (
            <g pointerEvents="none">
              <line x1={hoverX} x2={hoverX} y1={0} y2={innerHeight} stroke="var(--chart-crosshair)" strokeWidth={1} />
              <circle cx={hoverX} cy={yScale(hovered.cached)} r={3.5} fill={CACHED} stroke="var(--chart-background)" strokeWidth={2} />
              <circle cx={hoverX} cy={yScale(hovered.cached + hovered.origin)} r={3.5} fill={ORIGIN} stroke="var(--chart-background)" strokeWidth={2} />
            </g>
          )}

          <rect x={0} y={0} width={innerWidth} height={innerHeight} fill="transparent" onMouseMove={handleMove} onMouseLeave={() => setHoverIndex(null)} />
        </g>
      </svg>

      {hovered && (
        <div className="pointer-events-none absolute top-2 z-10" style={flip ? { right: width - tooltipX + 12 } : { left: tooltipX + 12 }}>
          <div className="min-w-[160px] rounded-none border border-border bg-popover px-3 py-2.5 text-white">
            <div className="mb-2 text-xs font-medium text-neutral-400">{formatDate(hovered.date)}</div>
            <div className="space-y-1.5">
              <TooltipRow color={TOTAL_DOT} label="Total" value={formatBytes(hovered.total)} />
              <TooltipRow color={CACHED} label="Cached" value={formatBytes(hovered.cached)} />
              <TooltipRow color={ORIGIN} label="Origin" value={formatBytes(hovered.origin)} />
              <div className="mt-1.5 flex items-center justify-between gap-4 border-t border-border pt-1.5">
                <span className="text-sm text-neutral-400">Hit rate</span>
                <span className="text-sm font-medium tabular-nums text-white">{Math.round(hovered.hitRate)}%</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function TooltipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-none" style={{ backgroundColor: color }} />
        <span className="text-sm text-neutral-400">{label}</span>
      </div>
      <span className="text-sm font-medium tabular-nums text-white">{value}</span>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 font-mono text-xs text-neutral-500">
      <span className="h-2 w-2 rounded-none" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

// ─── Traffic distribution — ranked row ───────────────────────────

function DistributionRow({ row, maxBandwidth, totalBandwidth }: { row: BunnyGeoRow; maxBandwidth: number; totalBandwidth: number }) {
  const cc = extractCountryCode(row.country_code)
  const city = extractCity(row.country_code)
  // Bar length ranks by share of the busiest datacenter; the hover-% is share of
  // total traffic (the meaningful figure), full precision in the title.
  const share = maxBandwidth > 0 ? row.bandwidth / maxBandwidth : 0
  const pct = totalBandwidth > 0 ? (row.bandwidth / totalBandwidth) * 100 : 0
  return (
    <div
      className="group relative flex h-9 items-center gap-2 rounded-none px-2 transition-colors duration-fast ease-apple hover:bg-neutral-800/40"
      title={`${pct.toFixed(2)}% of total traffic · ${formatBytes(row.bandwidth)}`}
    >
      <RowBar share={share} />
      <span className="relative flex min-w-0 flex-1 items-center gap-2">
        {getFlagIcon(cc) || <span className="h-3.5 w-5 shrink-0 rounded-none bg-neutral-800" aria-hidden="true" />}
        <span className="truncate text-sm text-white">{city}</span>
        {cc && <span className="shrink-0 font-mono text-xs text-neutral-500">{cc}</span>}
      </span>
      <span className="relative flex shrink-0 items-center gap-3 text-sm tabular-nums">
        <span className="text-xs font-medium tabular-nums text-brand-orange opacity-0 transition-opacity duration-fast ease-apple group-hover:opacity-100">
          {pct.toFixed(1)}%
        </span>
        <span className="w-20 text-right text-white">{formatBytes(row.bandwidth)}</span>
      </span>
    </div>
  )
}
