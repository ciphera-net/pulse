'use client'

import { useCallback, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { FunnelSimple, TreeStructure, X } from '@phosphor-icons/react'
import { Switcher } from '@ciphera-net/facet'
import { aggregateJourney } from '@/lib/journeys/aggregate'
import { buildLinks, spineThrough } from '@/lib/journeys/chain'
import { formatDate } from '@/lib/utils/dateRanges'
import { formatDate as formatDisplayDate } from '@/lib/utils/formatDate'
import DateRangePicker from '@/components/ui/DateRangePicker'
import SankeyJourney from '@/components/journeys/SankeyJourney'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { UpdatingChip } from '@/components/ui/UpdatingChip'
import { TermInfoTip } from '@/components/dashboard/MetricInfoTip'
import { JourneysSkeleton } from '@/components/skeletons'
import FilterButton from '@/components/dashboard/FilterButton'
import FilterPills from '@/components/dashboard/FilterPills'
import FilterBuilder from '@/components/dashboard/filter/FilterBuilder'
import { useFilterBuilder } from '@/components/dashboard/filter/useFilterBuilder'
import { useFilterSuggestions } from '@/lib/hooks/useFilterSuggestions'
import { TERMS } from '@/lib/dashboard/terms'
import type { DimensionFilter } from '@/lib/filters'
import {
  useJourneyFilters,
  JOURNEY_FILTER_DIMENSIONS,
  ENTRY_DIMENSION,
  DEPTH_OPTIONS,
  DENSITY_OPTIONS,
  type Period,
} from '@/lib/hooks/useJourneyFilters'
import { useDashboard, useJourneyTransitions } from '@/lib/swr/dashboard'

// ---------------------------------------------------------------------------
// Journeys (07-09-2026 simplification, owner pick "A solid"):
//   - ONE view — the flow. The columns view, its switcher and `view=` are gone.
//   - Depth and Paths are solid Switchers over a short ladder, and they REMEMBER.
//   - Filter lives in the page header beside the date range, dashboard order
//     (pills · Filter · range). The entry point is a filter like any other —
//     "Entry page" in the popover, a pill in the header — not a control of
//     its own, and there is no Reset: every filter has its own ×.
//   - The block carries one note line saying what the canvas shows.
// ---------------------------------------------------------------------------

const DEPTH_SWITCH = DEPTH_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))
const DENSITY_SWITCH = DENSITY_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))

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

  // * The fetch waits for memory (one render): an empty siteId is a null SWR key.
  const fetchSiteId = filters.ready ? siteId : ''
  const {
    data: transitionsData,
    error: transitionsError,
    isLoading: transitionsLoading,
    isValidating: transitionsValidating,
    mutate: retryTransitions,
  } = useJourneyTransitions(
    fetchSiteId,
    filters.dateRange.start,
    filters.dateRange.end,
    filters.committedDepth,
    1,
    filters.entryPath || undefined,
    filters.filtersParam || undefined,
  )

  // ── The dashboard filter system, restricted to journeys' dimensions ──
  const fetchSuggestions = useFilterSuggestions(siteId, filters.dateRange, filters.filtersParam || undefined)
  const filterBuilder = useFilterBuilder(fetchSuggestions)
  const handleFilterApply = useCallback(
    (filter: DimensionFilter, editingIndex: number | null) => {
      if (editingIndex !== null) {
        filters.setDimensionFilters(filters.dimensionFilters.map((f, i) => (i === editingIndex ? filter : f)))
        return
      }
      const dup = filters.dimensionFilters.some(
        (f) => f.dimension === filter.dimension && f.operator === filter.operator && f.values.join(';') === filter.values.join(';'),
      )
      if (dup) return
      // * One entry page at a time — the API takes a single path.
      const rest =
        filter.dimension === ENTRY_DIMENSION
          ? filters.dimensionFilters.filter((f) => f.dimension !== ENTRY_DIMENSION)
          : filters.dimensionFilters
      filters.setDimensionFilters([...rest, filter])
    },
    [filters],
  )
  const clearEntry = useCallback(
    () => filters.setDimensionFilters(filters.dimensionFilters.filter((f) => f.dimension !== ENTRY_DIMENSION)),
    [filters],
  )

  const { data: dashboard } = useDashboard(siteId, filters.dateRange.start, filters.dateRange.end)

  useEffect(() => {
    const domain = dashboard?.site?.domain
    document.title = domain ? `Journeys · ${domain} | Pulse` : 'Journeys | Pulse'
  }, [dashboard?.site?.domain])

  // * First-ever load only — keepPreviousData keeps the canvas mounted with
  // * stale data on every later refetch, so this is true once per mount.
  const showSkeleton = !filters.ready || (transitionsLoading && !transitionsData)
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

  const hasFilters = filters.dimensionFilters.length > 0

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pb-8">
      {/* Header — title on the left; pills · Filter · date range on the right (the dashboard's order) */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-neutral-200 mb-1">
            Journeys
          </h1>
          <p className="text-sm text-neutral-400">
            How visitors navigate through your site
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasFilters && (
            <FilterPills
              filters={filters.dimensionFilters}
              onEdit={(index, anchor) => filterBuilder.openEdit(filters.dimensionFilters[index], index, anchor)}
              onRemove={(index) => filters.setDimensionFilters(filters.dimensionFilters.filter((_, i) => i !== index))}
              onClear={() => filters.setDimensionFilters([])}
            />
          )}
          <FilterButton
            hasActiveFilters={hasFilters}
            active={filterBuilder.open}
            onClick={(anchor) => filterBuilder.openCreate(anchor)}
          />
          <DateRangePicker
            period={filters.period}
            dateRange={filters.dateRange}
            onPeriodChange={(p) => filters.setPeriod(p as Period)}
            onDateRangeChange={(range) => filters.setPeriod('custom', range)}
            onShift={shiftPeriod}
          />
        </div>
      </div>

      {/* The block: toolbar · note · canvas */}
      <div className="bg-card border border-border rounded-none overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Depth</span>
            <Switcher
              size="sm"
              tone="solid"
              aria-label="Depth"
              options={DEPTH_SWITCH}
              value={String(filters.depth)}
              onChange={(v) => filters.setDepth(Number(v))}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Paths</span>
            <Switcher
              size="sm"
              tone="solid"
              aria-label="Paths"
              options={DENSITY_SWITCH}
              value={String(filters.density)}
              onChange={(v) => filters.setDensity(Number(v))}
            />
          </div>
          {/* One sentence covers BOTH ladders ("Steps plotted … and pages kept per step"). */}
          <TermInfoTip term="journey_depth_density" />
          {filters.lens && (
            <div className="inline-flex h-10 max-w-64 items-center gap-1.5 rounded-none border border-neutral-800 px-2.5 sm:ml-auto">
              <span className="flex items-center gap-1 text-xs text-neutral-500">
                Lens
                <TermInfoTip term="journey_lens" />
              </span>
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
        </div>

        {/* The note: what the canvas shows */}
        <p className="border-b border-border px-4 py-2.5 text-xs text-neutral-500" data-testid="journeys-note">
          {filters.entryPath
            ? `Journeys that began on ${filters.entryPath}.`
            : TERMS.journey_entry_point.definition}
        </p>

        {/* The canvas — error and settled-empty states before the flow */}
        <div data-tour="journeys-canvas" className="relative p-6">
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
                description="No sessions entered through this page in this period. Try another entry page or widen the date range."
                action={{ label: 'Remove the entry page filter', onClick: clearEntry }}
              />
            ) : hasFilters ? (
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

      {/* Filter popover — journeys' dimensions: the entry page + the session_flows set */}
      <FilterBuilder
        builder={filterBuilder}
        filters={filters.dimensionFilters}
        onApply={handleFilterApply}
        allowedDimensions={JOURNEY_FILTER_DIMENSIONS}
      />
    </div>
  )
}
