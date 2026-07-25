'use client'

import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { DURATION_BASE, EASE_APPLE } from '@/lib/motion'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import DateRangePicker from '@/components/ui/DateRangePicker'
import { useUrlDateRange, type Period } from '@/lib/hooks/useUrlDateRange'
import { MagnifyingGlass, ArrowSquareOut } from '@phosphor-icons/react'
import { useSite, useGSCStatus, useGSCOverview } from '@/lib/swr/dashboard'
import { SearchSkeleton } from '@/components/skeletons'
import SearchTrafficChart from '@/components/search/SearchTrafficChart'
import SearchViews from '@/components/search/SearchViews'
import { SyncStatusLine } from '@/components/integrations/SyncStatusLine'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { UpdatingChip } from '@/components/ui/UpdatingChip'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { guardedPctChange, type PctChangeResult } from '@/lib/utils/pctChange'
import { formatNumber } from '@/lib/utils/format'

// ─── Helpers ────────────────────────────────────────────────────

const cascade = (delay: number) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: DURATION_BASE, ease: EASE_APPLE, delay },
})

// ─── Page ───────────────────────────────────────────────────────

export default function SearchConsolePage() {
  const params = useParams()
  const siteId = params.id as string

  const { period, dateRange, setPeriod, shiftPeriod } = useUrlDateRange()

  const { data: gscStatus } = useGSCStatus(siteId)
  const connected = gscStatus?.connected
  const { data: site } = useSite(siteId)
  const {
    data: overview,
    isLoading: overviewLoading,
    isValidating: overviewValidating,
    error: overviewError,
    mutate: retryOverview,
  } = useGSCOverview(siteId, dateRange.start, dateRange.end)

  // Document title
  useEffect(() => {
    const domain = site?.domain
    document.title = domain ? `Search Console · ${domain} | Pulse` : 'Search Console | Pulse'
  }, [site?.domain])

  // ─── Route-level state: skeleton only on the very first load ──
  if (gscStatus === undefined || (connected && overview === undefined && overviewLoading)) {
    return <SearchSkeleton />
  }

  // ─── Not connected state ──────────────────────────────────

  if (gscStatus && !gscStatus.connected) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 pb-8">
        {/* * Same page header as the connected view — without it this tab was
         * the only one with no h1 and read as a different app. */}
        <div className="mb-8">
          <h1 className="text-lg font-semibold text-white mb-1">
            Search Console
          </h1>
          <p className="text-sm text-neutral-400">
            Google Search performance, queries, and page rankings
          </p>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="rounded-none bg-neutral-800 p-5 mb-6">
            <MagnifyingGlass size={40} className="text-neutral-500" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">
            Connect Google Search Console
          </h2>
          <p className="text-sm text-neutral-400 max-w-md mb-6">
            See how your site performs in Google Search. View top queries, pages, click-through rates, and average position data.
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

  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 pb-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-white">Search Console</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Google Search performance, queries, and page rankings
          </p>
          {gscStatus && (
            <SyncStatusLine
              status={gscStatus.status}
              lastSyncedAt={gscStatus.last_synced_at}
              errorMessage={gscStatus.error_message}
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

      {/* Content — the chip covers range changes, the ErrorCard covers failures */}
      <div className="relative">
        <UpdatingChip active={overviewValidating && !!overview} className="-top-1 right-0" />
        {overviewError ? (
          <ErrorCard
            title="Couldn't load search data"
            description="The Search Console request failed for this period. Your data is safe — this is a loading problem."
            onRetry={() => { void retryOverview() }}
          />
        ) : overview ? (
          <>
            {/* KPI band */}
            <motion.div {...cascade(0)} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard
                label="Clicks"
                value={overview.total_clicks}
                format={(v) => formatNumber(Math.round(v))}
                delta={guardedPctChange(overview.total_clicks, overview.prev_clicks, overview.prev_clicks)}
              />
              <KpiCard
                label="Impressions"
                value={overview.total_impressions}
                format={(v) => formatNumber(Math.round(v))}
                delta={guardedPctChange(overview.total_impressions, overview.prev_impressions, overview.prev_impressions)}
              />
              <KpiCard
                label="Avg CTR"
                value={overview.avg_ctr}
                format={(v) => `${(v * 100).toFixed(1)}%`}
                delta={guardedPctChange(overview.avg_ctr, overview.prev_avg_ctr, overview.prev_impressions)}
              />
              <KpiCard
                label="Avg position"
                value={overview.avg_position}
                format={(v) => v.toFixed(1)}
                delta={guardedPctChange(overview.avg_position, overview.prev_avg_position, overview.prev_impressions)}
                invert
              />
            </motion.div>

            {/* Traffic chart — dual-scale clicks (left) / impressions (right) */}
            <motion.div {...cascade(0.05)} className="mt-6">
              <SearchTrafficChart siteId={siteId} startDate={dateRange.start} endDate={dateRange.end} />
            </motion.div>

            {/* Five-view table system — queries / pages / countries / devices / opportunities */}
            <motion.div {...cascade(0.1)} className="mt-6">
              <SearchViews siteId={siteId} dateRange={dateRange} />
            </motion.div>
          </>
        ) : null}
      </div>
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────

// KPI band — dashboard KPI language (mono micro label, tabular AnimatedNumber,
// guarded delta). Position is an INVERTED metric: lower is better, so a drop is
// green. The guard (min base 10) silences noisy -100%-on-tiny-base deltas.
function DeltaBadge({ change, invert = false }: { change: PctChangeResult; invert?: boolean }) {
  if (!change || change.type !== 'pct') return null
  if (change.value === 0) {
    return <span className="text-xs tabular-nums text-neutral-500">0%</span>
  }
  const up = change.value > 0
  const good = invert ? !up : up
  return (
    <span className={`text-xs font-medium tabular-nums ${good ? 'text-green-400' : 'text-red-400'}`}>
      {up ? '↑' : '↓'} {Math.abs(change.value)}%
    </span>
  )
}

function KpiCard({
  label,
  value,
  format,
  delta,
  invert = false,
}: {
  label: string
  value: number
  format: (v: number) => string
  delta: PctChangeResult
  invert?: boolean
}) {
  return (
    <div className="rounded-none border border-border bg-card p-4">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <span className="text-xs text-neutral-500">{label}</span>
        <DeltaBadge change={delta} invert={invert} />
      </div>
      <AnimatedNumber value={value} format={format} className="text-2xl font-semibold tabular-nums text-white" />
    </div>
  )
}
