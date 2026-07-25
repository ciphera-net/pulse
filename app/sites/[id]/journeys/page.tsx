'use client'

import { useCallback, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { FlowArrow, FunnelSimple, Rows, TreeStructure, X } from '@phosphor-icons/react'
import { aggregateJourney } from '@/lib/journeys/aggregate'
import { buildLinks, spineThrough } from '@/lib/journeys/chain'
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
import FilterButton from '@/components/dashboard/FilterButton'
import FilterPills from '@/components/dashboard/FilterPills'
import FilterBuilder from '@/components/dashboard/filter/FilterBuilder'
import { useFilterBuilder } from '@/components/dashboard/filter/useFilterBuilder'
import { useFilterSuggestions } from '@/lib/hooks/useFilterSuggestions'
import type { DimensionFilter } from '@/lib/filters'
import {
  useJourneyFilters,
  JOURNEY_FILTER_DIMENSIONS,
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
  const router = useRouter()
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
    filters.filtersParam || undefined,
  )
  const { data: entryPoints } = useJourneyEntryPoints(
    siteId,
    filters.dateRange.start,
    filters.dateRange.end,
    filters.filtersParam || undefined,
  )

  // ── Dashboard filter system restricted to journeys dimensions ──
  const fetchSuggestions = useFilterSuggestions(siteId, filters.dateRange, filters.filtersParam || undefined)
  const filterBuilder = useFilterBuilder(fetchSuggestions)
  const handleFilterApply = useCallback(
    (filter: DimensionFilter, editingIndex: number | null) => {
      if (editingIndex !== null) {
        filters.setDimensionFilters(filters.dimensionFilters.map((f, i) => (i === editingIndex ? filter : f)))
      } else {
        const dup = filters.dimensionFilters.some(
          (f) => f.dimension === filter.dimension && f.operator === filter.operator && f.values.join(';') === filter.values.join(';'),
        )
        if (!dup) filters.setDimensionFilters([...filters.dimensionFilters, filter])
      }
    },
    [filters],
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

  // * Lens → funnel cross-link: the heaviest chain through the lens becomes
  // * a prefilled create-funnel modal on the funnels page.
  const createFunnelFromLens = () => {
    if (!filters.lens) return
    const columns = aggregateJourney(transitions, {
      depth: filters.committedDepth,
      maxPagesPerStep: filters.committedDensity,
    })
    const spine = spineThrough(buildLinks(transitions, columns), filters.lens, 6)
    const values = spine.length > 0 ? spine : [filters.lens]
    const prefill = {
      name: `Journey via ${filters.lens}`,
      steps: values.map((value) => ({ value, type: 'exact', category: 'page' })),
    }
    router.push(`/sites/${siteId}/funnels?prefill=${encodeURIComponent(JSON.stringify(prefill))}`)
  }

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
              <div className="inline-flex h-10 max-w-64 items-center gap-1.5 rounded-none border border-neutral-800 px-2.5">
                <span className="text-xs text-neutral-500">Lens</span>
                <span className="truncate text-sm text-white" title={filters.lens}>
                  {filters.lens}
                </span>
                <button
                  type="button"
                  aria-label="Create funnel from this path"
                  title="Create funnel from this path"
                  onClick={createFunnelFromLens}
                  className="ml-0.5 rounded-none p-0.5 text-neutral-500 transition-colors duration-fast ease-apple hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
                >
                  <FunnelSimple className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Clear lens"
                  onClick={() => filters.setLens(null)}
                  className="rounded-none p-0.5 text-neutral-500 transition-colors duration-fast ease-apple hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <FilterButton
              hasActiveFilters={filters.dimensionFilters.length > 0}
              active={filterBuilder.open}
              onClick={(anchor) => filterBuilder.openCreate(anchor)}
            />
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

        {/* Active filter pills — only present when filters are applied */}
        {filters.dimensionFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
            <FilterPills
              filters={filters.dimensionFilters}
              onEdit={(index, anchor) => filterBuilder.openEdit(filters.dimensionFilters[index], index, anchor)}
              onRemove={(index) => filters.setDimensionFilters(filters.dimensionFilters.filter((_, i) => i !== index))}
              onClear={() => filters.setDimensionFilters([])}
            />
          </div>
        )}

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
            ) : filters.dimensionFilters.length > 0 ? (
              <EmptyState
                icon={<TreeStructure />}
                title="No journeys match these filters"
                description="No sessions match the active filters in this period. Try loosening them or widening the date range."
                action={{ label: 'Clear filters', onClick: () => filters.setDimensionFilters([]) }}
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
              /* Columns stay readable at ≤10 rows/step; the flow view is the
                 detailed lens for higher densities. */
              maxPagesPerStep={Math.min(filters.committedDensity, 10)}
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

      {/* Filter popover — dimensions restricted to journeys' V1 set */}
      <FilterBuilder
        builder={filterBuilder}
        filters={filters.dimensionFilters}
        onApply={handleFilterApply}
        allowedDimensions={JOURNEY_FILTER_DIMENSIONS}
      />
    </div>
  )
}
