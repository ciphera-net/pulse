'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { TreeStructure } from '@phosphor-icons/react'
import { Switcher } from '@ciphera-net/facet'
import DateRangePicker from '@/components/ui/DateRangePicker'
import FrameToolbar from '@/components/dashboard/FrameToolbar'
import SearchFilter from '@/components/dashboard/filter/search/SearchFilter'
import FiltersBox from '@/components/dashboard/filter/search/FiltersBox'
import { TermInfoTip } from '@/components/dashboard/MetricInfoTip'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { UpdatingChip } from '@/components/ui/UpdatingChip'
import { SkeletonCard } from '@/components/skeletons'
import { useUrlDateRange } from '@/lib/hooks/useUrlDateRange'
import { useFilterSuggestions } from '@/lib/hooks/useFilterSuggestions'
import { ENTRY_DIMENSION, JOURNEY_EVENT_FILTER_DIMENSIONS, JOURNEY_FILTER_DIMENSIONS } from '@/lib/hooks/useJourneyFilters'
import { fetchableRange, serverResolvedPeriod } from '@/lib/dashboard/resolveRange'
import { dashboardCapabilities } from '@/lib/dashboard/capabilities'
import { FRAME_CARD_NAME, FRAME_SURFACE } from '@/lib/dashboard/frameClasses'
import { EVENT_FILTERS_FLAG, parseFiltersFromURL, serializeFilters, type DimensionFilter } from '@/lib/filters'
import { useFeature } from '@/lib/features'
import { useDataWindow, useJourneyFlow, useSite } from '@/lib/swr/dashboard'
import { canWrite, scopeHref, useSiteScope } from '@/lib/scope/SiteScope'
import { displayDomain } from '@/lib/utils/displayDomain'
import { siteDaysCaption } from '@/lib/utils/timezones'
import { formatNumber } from '@/lib/utils/format'
import type { PageValues } from '@/components/dashboard/filter/search/values'
import FlowChart from './FlowChart'
import { entryOnlyTotal, sliceFlow } from './flowMath'

// ---------------------------------------------------------------------------
// The new Journeys page (in beta behind `new-journeys`, components/journeys/flow/flag.ts; the owner's rulings R87 to
// R96 of 18-11-2026, Pulse/docs/plans/18-11-2026-journeys-page-overhaul-plan.md). From the top: the dashboard's
// toolbar (the Search filter with its box, the date control), one glass block with the flow (FlowChart.tsx) and its
// Steps switch, and under it the pressed journey's card.
//
// One read: the flow at six steps. The Steps switch (3, 4, 5; 5 on arrival) cuts it in the browser (sliceFlow), so a
// choice draws at once and the pressed card knows what came after the last step drawn.
//
// Filters: the journeys read answers the entry page, country, device and referrer (and an event, its property and an
// outbound link while that beta is on), so the Search filter offers only those (SearchFilter's `only`). The entry page
// travels as its own parameter; one at a time, as the read takes one.
// ---------------------------------------------------------------------------

/** No page-answer values: the journeys read lists paths only. */
const NO_PAGE_VALUES: PageValues = {}
const STEPS = [3, 4, 5] as const
const STEPS_DEFAULT = 5
const STEP_OPTIONS = STEPS.map((n) => ({ value: String(n), label: `${n} steps` }))
/** The read's own depth: every Steps choice is cut from it. */
const READ_DEPTH = 6

export default function JourneysFlowPage({ siteId }: { siteId: string }) {
  const scope = useSiteScope()
  const caps = useMemo(() => dashboardCapabilities(scope), [scope])
  const member = canWrite(scope)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: site } = useSite(siteId)

  useEffect(() => {
    if (site?.domain) document.title = `Journeys · ${displayDomain(site)} | Pulse`
  }, [site])

  // The view, like every other page's, answered against Journeys' own data window: it ends YESTERDAY (the paths are
  // built overnight), so Today is greyed and a remembered Today opens as "Yesterday".
  const dataWindow = useDataWindow(siteId, 'journeys')
  const { period, dateRange, periodReady, picker } = useUrlDateRange({
    surface: 'journeys',
    window: dataWindow,
    timezone: site?.timezone,
    retentionMonths: site?.data_retention_months,
    daysCaption: siteDaysCaption(site?.timezone),
  })
  const range = fetchableRange(periodReady, dateRange)
  const apiPeriod = serverResolvedPeriod(periodReady, period)

  const eventFilters = useFeature(EVENT_FILTERS_FLAG) === true
  const only = eventFilters ? JOURNEY_EVENT_FILTER_DIMENSIONS : JOURNEY_FILTER_DIMENSIONS
  const [filters, setFilters] = useState<DimensionFilter[]>(() => {
    const raw = caps.filters ? searchParams.get('filters') : null
    const allowed = new Set<string>(JOURNEY_EVENT_FILTER_DIMENSIONS)
    // A filter the journeys read cannot answer (one set on the dashboard) is left behind, never sent.
    return raw ? parseFiltersFromURL(raw).filter((f) => allowed.has(f.dimension) || f.dimension.startsWith('event_property:')) : []
  })
  const entry = filters.find((f) => f.dimension === ENTRY_DIMENSION)?.values[0]
  const rest = useMemo(() => filters.filter((f) => f.dimension !== ENTRY_DIMENSION), [filters])
  const filtersParam = useMemo(() => serializeFilters(rest), [rest])
  const urlFilters = useMemo(() => serializeFilters(filters), [filters])
  useEffect(() => {
    const url = new URL(window.location.href)
    if (urlFilters) url.searchParams.set('filters', urlFilters)
    else url.searchParams.delete('filters')
    window.history.replaceState({}, '', url.toString())
  }, [urlFilters])

  const handleFilterApply = useCallback((filter: DimensionFilter, editingIndex: number | null) => {
    setFilters((prev) => {
      if (editingIndex !== null) return prev.map((f, i) => (i === editingIndex ? filter : f))
      const duplicate = prev.some((f) => f.dimension === filter.dimension && f.operator === filter.operator && f.values.join(';') === filter.values.join(';'))
      if (duplicate) return prev
      // One entry page at a time: the read takes a single path.
      const others = filter.dimension === ENTRY_DIMENSION ? prev.filter((f) => f.dimension !== ENTRY_DIMENSION) : prev
      return [...others, filter]
    })
  }, [])
  const handleRemoveFilter = useCallback((index: number) => setFilters((prev) => prev.filter((_, i) => i !== index)), [])
  const handleClearFilters = useCallback(() => setFilters([]), [])
  const handleApplySet = useCallback((next: DimensionFilter[]) => setFilters(next), [])
  const fetchSuggestions = useFilterSuggestions(siteId, range.start && range.end ? range : null, filtersParam || undefined, apiPeriod)

  // Steps: 5 on arrival (owner, 18-11-2026), kept in the address only when another is chosen.
  const [steps, setSteps] = useState<number>(() => {
    const n = Number(searchParams.get('steps'))
    return (STEPS as readonly number[]).includes(n) ? n : STEPS_DEFAULT
  })
  useEffect(() => {
    const url = new URL(window.location.href)
    if (steps === STEPS_DEFAULT) url.searchParams.delete('steps')
    else url.searchParams.set('steps', String(steps))
    window.history.replaceState({}, '', url.toString())
  }, [steps])

  const { data: deep, error, isLoading, isValidating, mutate } = useJourneyFlow(periodReady ? siteId : '', range.start, range.end, READ_DEPTH, entry, filtersParam || undefined, apiPeriod)
  const flow = useMemo(() => (deep ? sliceFlow(deep, steps) : undefined), [deep, steps])
  const [cardSlot, setCardSlot] = useState<HTMLDivElement | null>(null)

  // A member makes a funnel of the pressed route: the Funnels page opens with its steps filled in (as today's "Create
  // funnel from this path").
  const onFunnel = useCallback((route: string[], via: string) => {
    const prefill = { name: `Journey via ${via}`, steps: route.map((value) => ({ value, type: 'exact', category: 'page' })) }
    router.push(scopeHref(scope, 'funnels', `?prefill=${encodeURIComponent(JSON.stringify(prefill))}`))
  }, [router, scope])

  const toolbar = (
    <FrameToolbar>
      <div className="hidden flex-1 sm:block" />
      {caps.filters && (
        <>
          <FiltersBox filters={filters} onApply={handleFilterApply} onRemove={handleRemoveFilter} onClearAll={handleClearFilters} pageValues={NO_PAGE_VALUES} />
          <SearchFilter filters={filters} onApply={handleFilterApply} fetchSuggestions={fetchSuggestions} pageValues={NO_PAGE_VALUES} onApplySet={handleApplySet} eventFilters={eventFilters} only={only} />
        </>
      )}
      <DateRangePicker {...picker} />
    </FrameToolbar>
  )

  const onePage = deep ? entryOnlyTotal(deep) : 0
  const any = !!deep && (deep.total_sessions > 0 || onePage > 0)
  let body: React.ReactNode
  if (error) {
    body = <ErrorCard title="Could not load journeys" description="The request failed. This is usually temporary." onRetry={() => { void mutate() }} />
  } else if (!periodReady || (isLoading && !deep)) {
    // Until the site's timezone and data window are known there is no range to ask for (as on the Pages page).
    body = <SkeletonCard className="h-[560px]" />
  } else if (!deep) {
    // The read was switched on and there is no flow, no error and nothing in flight: the scope does not answer it.
    body = <EmptyState icon={<TreeStructure />} title="This page is not available" description="The site owner has not shared it." />
  } else if (!any) {
    body = entry ? (
      <EmptyState icon={<TreeStructure />} title={`No journeys start at ${entry}`} description="No visit began on this page in this period. Try another entry page or a longer range." action={{ label: 'Remove the entry page filter', onClick: () => setFilters((p) => p.filter((f) => f.dimension !== ENTRY_DIMENSION)) }} />
    ) : filters.length > 0 ? (
      <EmptyState icon={<TreeStructure />} title="No journeys match these filters" description="No visit matches the filters in this period. Try fewer filters or a longer range." action={{ label: 'Clear filters', onClick: handleClearFilters }} />
    ) : (
      <EmptyState
        icon={<TreeStructure />}
        title="No journey data yet"
        description={member ? 'Journeys appear here as visitors move through your site.' : 'Journeys appear here as visitors move through this site.'}
        action={member ? { label: 'View setup guide', href: '/installation' } : undefined}
      />
    )
  } else {
    const all = deep.total_sessions + onePage
    body = (
      <section className={`${FRAME_SURFACE} relative min-w-0 p-6 [container-type:inline-size]`} data-journeys-block="">
        <UpdatingChip active={isValidating} />
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="flex items-center gap-1.5">
            <span className={FRAME_CARD_NAME}>Journeys</span>
            <TermInfoTip term="journeys_flow" />
          </span>
          <span className="me-auto text-[11px] text-neutral-500" data-journeys-count="">
            {onePage > 0 ? `${formatNumber(all)} visits, ${formatNumber(deep.total_sessions)} went past their first page` : `${formatNumber(deep.total_sessions)} visits went past their first page`}
          </span>
          <Switcher size="sm" tone="solid" aria-label="Steps" options={STEP_OPTIONS} value={String(steps)} onChange={(v) => setSteps(Number(v))} />
        </div>
        {flow && <FlowChart flow={flow} deep={deep} cardSlot={cardSlot} onFunnel={member ? onFunnel : undefined} />}
      </section>
    )
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6" data-journeys-page="">
      {toolbar}
      {body}
      <div ref={setCardSlot} data-journeys-card-slot="" />
    </div>
  )
}
