'use client'

import { useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import { DURATION_BASE, EASE_APPLE } from '@/lib/motion'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import DateRangePicker from '@/components/ui/DateRangePicker'
import { useUrlDateRange, type Period } from '@/lib/hooks/useUrlDateRange'
import { useQueryParamsWriter } from '@/lib/hooks/useQueryParamsWriter'
import { getDateRange } from '@/lib/utils/format'
import type { PeriodPreset } from '@/lib/constants/periods'
import { MagnifyingGlass, ArrowSquareOut } from '@phosphor-icons/react'
import { useSite, useGSCStatus, useGSCOverview } from '@/lib/swr/dashboard'
import { SearchSkeleton } from '@/components/skeletons'
import InstrumentPanel from '@/components/search/InstrumentPanel'
import SearchViews from '@/components/search/SearchViews'
import { SyncStatusLine } from '@/components/integrations/SyncStatusLine'
import { UpdatingChip } from '@/components/ui/UpdatingChip'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { Segmented, type SegmentedOption } from '@/components/ui/segmented'
import { METRIC_ORDER, METRIC_LABEL, parseGranularity, type Granularity } from '@/components/search/searchMetrics'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Search Console — the instrument-panel layout. Range pills in GSC's own
// vocabulary (7d/28d/3m/6m/12m/16m; 16m is Google's ~480-day retention cap,
// no 24h because the API is daily-only with a ~2-day lag), a granularity
// control that rolls the daily series up client-side, and the InstrumentPanel
// where each metric row is both the KPI tile and the chart strip. Table views
// live in SearchViews below, sharing the same URL-synced date state.
// ---------------------------------------------------------------------------

const cascade = (delay: number) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: DURATION_BASE, ease: EASE_APPLE, delay },
})

const RANGE_PILLS: { key: Period; label: string }[] = [
  { key: '7', label: '7d' },
  { key: '28', label: '28d' },
  { key: '3m', label: '3m' },
  { key: '6m', label: '6m' },
  { key: '12m', label: '12m' },
  { key: '16m', label: '16m' },
]

// * The same vocabulary, spelled out for the DateRangePicker beside the pills —
// * without this the picker labels every pill period "Custom" and check-marks
// * nothing. Page-scoped on purpose: these ranges belong to GSC, not to every
// * picker in the product.
const GSC_PICKER_PRESETS: { group: string; presets: PeriodPreset[] } = {
  group: 'Search ranges',
  presets: [
    { key: '28', label: 'Last 28 days', group: 'Search ranges', resolve: () => getDateRange(28) },
    { key: '3m', label: 'Last 3 months', group: 'Search ranges', resolve: () => getDateRange(90) },
    { key: '6m', label: 'Last 6 months', group: 'Search ranges', resolve: () => getDateRange(180) },
    { key: '12m', label: 'Last 12 months', group: 'Search ranges', resolve: () => getDateRange(365) },
    { key: '16m', label: 'Last 16 months', group: 'Search ranges', resolve: () => getDateRange(480) },
  ],
}

const GRANULARITY_OPTIONS: SegmentedOption<Granularity>[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

function RangePills({ period, onPeriod }: { period: Period; onPeriod: (p: Period) => void }) {
  return (
    <div role="group" aria-label="Date range" className="inline-flex h-10 shrink-0 items-stretch divide-x divide-neutral-800 overflow-hidden rounded-none border border-neutral-800">
      {RANGE_PILLS.map(({ key, label }) => {
        const active = period === key
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => onPeriod(key)}
            className={cn(
              'px-3 text-sm font-medium transition-colors duration-fast ease-apple focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange',
              active ? 'bg-neutral-800/60 text-white' : 'text-neutral-500 hover:text-neutral-300',
            )}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

export default function SearchConsolePage() {
  const params = useParams()
  const siteId = params.id as string
  const searchParams = useSearchParams()
  const write = useQueryParamsWriter()

  const { period, dateRange, setPeriod, shiftPeriod } = useUrlDateRange()
  const granularity = parseGranularity(searchParams.get('g'))

  const setGranularity = useCallback(
    (g: Granularity) => write({ g: g === 'daily' ? null : g }),
    [write],
  )

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

  // ─── Not connected — the panel's shape, ghosted, with the CTA ──

  if (gscStatus && !gscStatus.connected) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 pb-8">
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-white mb-1">Search Console</h1>
          <p className="text-sm text-neutral-400">
            Google Search performance, queries, and page rankings
          </p>
        </div>
        <div className="flex rounded-none border border-border bg-card">
          {/* Ghost rails — what the page becomes once connected */}
          <div className="hidden w-48 shrink-0 flex-col border-r border-border sm:flex" aria-hidden="true">
            {METRIC_ORDER.map((key) => (
              <div key={key} className="flex flex-1 flex-col justify-center border-t border-border px-4 py-4 first:border-t-0">
                <span className="text-sm text-neutral-600">{METRIC_LABEL[key]}</span>
                <span className="mt-0.5 text-xl font-semibold text-neutral-700">&mdash;</span>
              </div>
            ))}
          </div>
          <div className="flex min-h-[360px] flex-1 flex-col items-center justify-center px-6 py-12 text-center">
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
      </div>
    )
  }

  // ─── Connected — main view ────────────────────────────────

  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 pb-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
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
        <div className="flex flex-wrap items-center gap-2">
          <RangePills period={period} onPeriod={(p) => setPeriod(p)} />
          <DateRangePicker
            period={period}
            dateRange={dateRange}
            onPeriodChange={(p) => setPeriod(p as Period)}
            onDateRangeChange={(range) => setPeriod('custom', range)}
            onShift={shiftPeriod}
            extraPresets={GSC_PICKER_PRESETS}
          />
        </div>
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
            {/* Instrument panel — each metric row is tile and strip at once */}
            <motion.div {...cascade(0)}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-xs text-neutral-500">Search traffic</span>
                <Segmented
                  ariaLabel="Chart granularity"
                  value={granularity}
                  onChange={setGranularity}
                  options={GRANULARITY_OPTIONS}
                  className="h-8"
                />
              </div>
              <InstrumentPanel siteId={siteId} dateRange={dateRange} overview={overview} granularity={granularity} />
            </motion.div>

            {/* Six-view table system — queries / pages / countries / devices / days / opportunities */}
            <motion.div {...cascade(0.08)} className="mt-6">
              <SearchViews siteId={siteId} dateRange={dateRange} />
            </motion.div>
          </>
        ) : null}
      </div>
    </div>
  )
}
