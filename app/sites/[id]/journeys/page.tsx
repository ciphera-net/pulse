'use client'

import { useCallback, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { FlowArrow, Rows, TreeStructure, X } from '@phosphor-icons/react'
import { formatDate } from '@/lib/utils/dateRanges'
import { formatDate as formatDisplayDate } from '@/lib/utils/formatDate'
import DateRangePicker from '@/components/ui/DateRangePicker'
import ColumnJourney from '@/components/journeys/ColumnJourney'
import SankeyJourney from '@/components/journeys/SankeyJourney'
import { StepperControl } from '@/components/ui/stepper-control'
import { Segmented } from '@/components/ui/segmented'
import { EntryCombobox } from '@/components/journeys/EntryCombobox'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { UpdatingChip } from '@/components/ui/UpdatingChip'
import { JourneysSkeleton } from '@/components/skeletons'
import {
  useJourneyFilters,
  DEPTH_MIN,
  DEPTH_MAX,
  DEPTH_STEP,
  DENSITY_MIN,
  DENSITY_MAX,
  DENSITY_STEP,
  type Period,
} from '@/lib/hooks/useJourneyFilters'
import {
  useDashboard,
  useJourneyTransitions,
  useJourneyEntryPoints,
} from '@/lib/swr/dashboard'

export default function JourneysPage() {
  const params = useParams()
  const siteId = params.id as string

  const filters = useJourneyFilters()

  const shiftPeriod = useCallback((direction: -1 | 1) => {
    const shift = (date: string, days: number) => {
      const d = new Date(date + 'T00:00:00')
      d.setDate(d.getDate() + days)
      return formatDate(d)
    }
    const startDate = new Date(filters.dateRange.start + 'T00:00:00')
    const endDate = new Date(filters.dateRange.end + 'T00:00:00')
    const spanDays = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1
    const offsetDays = spanDays * direction
    const newRange = {
      start: shift(filters.dateRange.start, offsetDays),
      end: shift(filters.dateRange.end, offsetDays),
    }
    const today = formatDate(new Date())
    if (newRange.end > today) return
    filters.setPeriod('custom', newRange)
  }, [filters.dateRange, filters.setPeriod])

  const {
    data: transitionsData,
    error: transitionsError,
    isLoading: transitionsLoading,
    isValidating: transitionsValidating,
    mutate: retryTransitions,
  } = useJourneyTransitions(
    siteId,
    filters.dateRange.start,
    filters.dateRange.end,
    filters.committedDepth,
    1,
    filters.entryPath || undefined,
  )
  const { data: entryPoints } = useJourneyEntryPoints(
    siteId,
    filters.dateRange.start,
    filters.dateRange.end,
  )
  const { data: dashboard } = useDashboard(
    siteId,
    filters.dateRange.start,
    filters.dateRange.end,
  )

  useEffect(() => {
    const domain = dashboard?.site?.domain
    document.title = domain ? `Journeys \u00b7 ${domain} | Pulse` : 'Journeys | Pulse'
  }, [dashboard?.site?.domain])

  // * First-ever load only — keepPreviousData keeps the canvas mounted with
  // * stale data on every later refetch, so this is true once per mount.
  const showSkeleton = transitionsLoading && !transitionsData

  if (showSkeleton) return <JourneysSkeleton />

  const totalSessions = transitionsData?.total_sessions ?? 0
  const transitions = transitionsData?.transitions ?? []
  const periodLabel = `${formatDisplayDate(new Date(filters.dateRange.start + 'T00:00:00'))} – ${formatDisplayDate(new Date(filters.dateRange.end + 'T00:00:00'))}`

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-neutral-200 mb-1">
            Journeys
          </h1>
          <p className="text-sm text-neutral-400">
            How visitors navigate through your site
          </p>
        </div>
        <DateRangePicker
          period={filters.period}
          dateRange={filters.dateRange}
          onPeriodChange={(p) => filters.setPeriod(p as Period)}
          onDateRangeChange={(range) => filters.setPeriod('custom', range)}
          onShift={shiftPeriod}
        />
      </div>

      {/* Single card: toolbar + chart */}
      <div className="bg-card border border-border rounded-none overflow-hidden">
        {/* Toolbar — one h-10 row; wraps to two rows <sm (steppers / combobox+view) */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <div className="flex items-center gap-2">
            <StepperControl
              label="Depth"
              value={filters.depth}
              min={DEPTH_MIN}
              max={DEPTH_MAX}
              step={DEPTH_STEP}
              onChange={filters.setDepth}
            />
            <StepperControl
              label="Paths"
              value={filters.density}
              min={DENSITY_MIN}
              max={DENSITY_MAX}
              step={DENSITY_STEP}
              onChange={filters.setDensity}
            />
          </div>
          <div className="flex min-w-[280px] flex-1 items-center gap-2">
            <EntryCombobox
              value={filters.entryPath}
              onChange={filters.setEntryPath}
              entries={entryPoints ?? []}
              className="min-w-0 flex-1 sm:w-64 sm:flex-none"
            />
            {filters.lens && (
              <div className="inline-flex h-10 max-w-56 items-center gap-1.5 rounded-none border border-neutral-800 px-2.5">
                <span className="font-mono text-xs text-neutral-500">Lens</span>
                <span className="truncate text-sm text-white" title={filters.lens}>
                  {filters.lens}
                </span>
                <button
                  type="button"
                  aria-label="Clear lens"
                  onClick={() => filters.setLens(null)}
                  className="ml-0.5 rounded-none p-0.5 text-neutral-500 transition-colors duration-fast ease-apple hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <span className="hidden flex-1 sm:block" />
            <button
              onClick={filters.resetFilters}
              disabled={filters.isDefault}
              className={`text-sm whitespace-nowrap transition-all duration-fast px-3 py-2 ${
                filters.isDefault
                  ? 'opacity-0 pointer-events-none'
                  : 'opacity-100 text-neutral-500 hover:text-white'
              } ease-apple`}
            >
              Reset
            </button>
            <Segmented
              ariaLabel="Journey view"
              value={filters.viewMode}
              onChange={filters.setViewMode}
              options={[
                { value: 'columns', label: 'Columns', icon: <Rows className="h-4 w-4" /> },
                { value: 'flow', label: 'Flow', icon: <FlowArrow className="h-4 w-4" /> },
              ]}
            />
          </div>
        </div>

        {/* Journey canvas — error and settled-empty states before either view */}
        <div className="relative p-6">
          <UpdatingChip active={transitionsValidating} />
          {transitionsError ? (
            <ErrorCard
              title="Couldn't load journeys"
              description="The journey data request failed. Your data is safe — this is a loading problem, not a tracking one."
              onRetry={() => { void retryTransitions() }}
            />
          ) : transitions.length === 0 ? (
            filters.entryPath ? (
              <EmptyState
                icon={<TreeStructure />}
                title={`No journeys start at ${filters.entryPath}`}
                description="No sessions entered through this page in this period. Try another entry point or widen the date range."
                action={{ label: 'Clear entry filter', onClick: () => filters.setEntryPath('') }}
              />
            ) : (
              <EmptyState
                icon={<TreeStructure />}
                title="No journey data yet"
                description="Navigation flows will appear here as visitors browse through your site."
                action={{ label: 'View setup guide', href: '/installation' }}
              />
            )
          ) : filters.viewMode === 'columns' ? (
            <ColumnJourney
              transitions={transitions}
              depth={filters.committedDepth}
              maxPagesPerStep={filters.committedDensity}
              lens={filters.lens}
              onLensChange={filters.setLens}
              totalSessions={totalSessions}
              periodLabel={periodLabel}
            />
          ) : (
            <SankeyJourney
              transitions={transitions}
              depth={filters.committedDepth}
              maxPagesPerStep={filters.committedDensity}
              lens={filters.lens}
              onLensChange={filters.setLens}
              totalSessions={totalSessions}
              periodLabel={periodLabel}
            />
          )}
        </div>
      </div>

    </div>
  )
}
