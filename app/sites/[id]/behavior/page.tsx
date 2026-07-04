'use client'

import { useCallback, useEffect } from 'react'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { X } from '@phosphor-icons/react'
import { DURATION_BASE, EASE_APPLE } from '@/lib/motion'
import { PERIOD_TO_API } from '@/lib/constants/periods'
import { useUrlDateRange, type Period } from '@/lib/hooks/useUrlDateRange'
import { useSite, useBehavior } from '@/lib/swr/dashboard'
import DateRangePicker from '@/components/ui/DateRangePicker'
import { UpdatingChip } from '@/components/ui/UpdatingChip'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { BehaviorSkeleton } from '@/components/skeletons'
import FrustrationSummaryCards from '@/components/behavior/FrustrationSummaryCards'
import FrustrationTable from '@/components/behavior/FrustrationTable'
import FrustrationByPageTable from '@/components/behavior/FrustrationByPageTable'
import FrustrationTrend from '@/components/behavior/FrustrationTrend'
import ScrollDepthBars from '@/components/behavior/ScrollDepthBars'

// ---------------------------------------------------------------------------
// Behavior — KPI band, a ?page= lens that filters the element tables through
// the existing pagePath API param, a real daily trend and scroll-depth rails.
// URL-synced range, first-load-only skeleton, a revalidation chip and a
// page-level ErrorCard: no fake-empties, no hiding a single row on failure.
// ---------------------------------------------------------------------------

const cascade = (delay: number) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: DURATION_BASE, ease: EASE_APPLE, delay },
})

export default function BehaviorPage() {
  const params = useParams()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const siteId = params.id as string

  const { period, dateRange, setPeriod, shiftPeriod } = useUrlDateRange()
  // * Preserve the server period hint (behavior collapses start/end to a period
  // * bucket for its cache when the range is a named preset).
  const apiPeriod = period !== 'custom' ? PERIOD_TO_API[period] || undefined : undefined

  const { data: behavior, isLoading, isValidating, error, mutate } = useBehavior(
    siteId,
    dateRange.start,
    dateRange.end,
    apiPeriod,
  )
  const { data: site } = useSite(siteId)

  // * ?page= lens lives in the URL alongside the range params (source of truth).
  const lensPage = searchParams.get('page')
  const setLensPage = useCallback(
    (path: string | null) => {
      const next = new URLSearchParams(searchParams.toString())
      if (path) next.set('page', path)
      else next.delete('page')
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams],
  )
  const toggleLens = useCallback(
    (path: string) => setLensPage(lensPage === path ? null : path),
    [lensPage, setLensPage],
  )

  useEffect(() => {
    const domain = site?.domain
    document.title = domain ? `Behavior · ${domain} | Pulse` : 'Behavior | Pulse'
  }, [site?.domain])

  // ── Route-level state: skeleton only on the very first load ────────
  if (isLoading && !behavior) return <BehaviorSkeleton />

  const summary = behavior?.summary
  const byPage = behavior?.by_page ?? []

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">Behavior</h1>
          <p className="mt-1 text-sm text-neutral-400">Frustration signals and engagement patterns</p>
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
        <UpdatingChip active={isValidating && !!behavior} className="-top-1 right-0" />
        {error ? (
          <ErrorCard
            title="Couldn't load behavior data"
            description="The frustration signals request failed for this period. Your data is safe — this is a loading problem."
            onRetry={() => { void mutate() }}
          />
        ) : summary ? (
          <>
            {/* KPI band */}
            <motion.div {...cascade(0)}>
              <FrustrationSummaryCards data={summary} />
            </motion.div>

            {/* Lens chip + element tables */}
            <motion.div {...cascade(0.04)} className="mt-6">
              {lensPage && (
                <button
                  type="button"
                  onClick={() => setLensPage(null)}
                  aria-label={`Clear page filter ${lensPage}`}
                  className="mb-3 inline-flex h-8 max-w-full items-center gap-1.5 rounded-none border border-border bg-card px-2.5 font-mono text-xs text-neutral-400 transition-colors duration-fast ease-apple hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
                >
                  <span className="truncate">Page: {lensPage}</span>
                  <span aria-hidden="true" className="text-neutral-600">·</span>
                  <X className="h-3 w-3 shrink-0" />
                </button>
              )}
              <div className="grid gap-3 lg:grid-cols-2 [&>*]:min-w-0">
                <FrustrationTable
                  kind="rage"
                  title="Rage clicks"
                  showAvgClicks
                  siteId={siteId}
                  start={dateRange.start}
                  end={dateRange.end}
                  lensPage={lensPage}
                  fallbackItems={behavior?.rage_clicks.items ?? []}
                  fallbackTotal={behavior?.rage_clicks.total ?? 0}
                  totalSignals={summary.rage_clicks}
                />
                <FrustrationTable
                  kind="dead"
                  title="Dead clicks"
                  siteId={siteId}
                  start={dateRange.start}
                  end={dateRange.end}
                  lensPage={lensPage}
                  fallbackItems={behavior?.dead_clicks.items ?? []}
                  fallbackTotal={behavior?.dead_clicks.total ?? 0}
                  totalSignals={summary.dead_clicks}
                />
              </div>
            </motion.div>

            {/* Frustration by page — the lens navigation */}
            <motion.div {...cascade(0.08)} className="mt-6">
              <FrustrationByPageTable pages={byPage} lensPage={lensPage} onToggleLens={toggleLens} />
            </motion.div>

            {/* Daily trend + scroll depth */}
            <motion.div {...cascade(0.12)} className="mt-6 grid gap-3 lg:grid-cols-2 [&>*]:min-w-0">
              <FrustrationTrend siteId={siteId} start={dateRange.start} end={dateRange.end} />
              <ScrollDepthBars scrollDepth={behavior?.scroll_depth} />
            </motion.div>
          </>
        ) : null}
      </div>
    </div>
  )
}
