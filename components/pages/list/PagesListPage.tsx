'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { FileText } from '@phosphor-icons/react'
import DateRangePicker from '@/components/ui/DateRangePicker'
import FrameToolbar from '@/components/dashboard/FrameToolbar'
import SearchFilter from '@/components/dashboard/filter/search/SearchFilter'
import FiltersBox from '@/components/dashboard/filter/search/FiltersBox'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { ApiError } from '@/lib/api/client'
import { SkeletonCard } from '@/components/skeletons'
import { useUrlDateRange } from '@/lib/hooks/useUrlDateRange'
import { useFilterSuggestions } from '@/lib/hooks/useFilterSuggestions'
import { previousDateRange } from '@/lib/hooks/periodUrl'
import { fetchableRange, resolveDashboardRange, serverResolvedPeriod } from '@/lib/dashboard/resolveRange'
import { dashboardCapabilities } from '@/lib/dashboard/capabilities'
import { parseFiltersFromURL, serializeFilters, type DimensionFilter } from '@/lib/filters'
import { useDashboard, useDataWindow, usePagesTable, useSite, useStats } from '@/lib/swr/dashboard'
import { scopeHref, useSiteScope } from '@/lib/scope/SiteScope'
import { todayIn } from '@/lib/import/core/dates'
import { displayDomain } from '@/lib/utils/displayDomain'
import { formatDate } from '@/lib/utils/format'
import type { PageValues } from '@/components/dashboard/filter/search/values'
import type { PageScrollBy } from '@/lib/api/stats'
import PagesList, { LIST_PARAMS } from './PagesList'
import PagesStrip from './PagesStrip'
import PageHours from './PageHours'
import ScrollWho from './ScrollWho'
import { beforeState } from './before'

// ---------------------------------------------------------------------------
// The Pages page as one list (rulings R78 and R82, 17-11-2026; every team's since 23-11-2026). From the
// top: the dashboard's toolbar (its Filter and its date control), a strip of five headline figures against the
// period before, and every page in one list (PagesList.tsx).
//
// Its reads, each asked once:
//   the pages read                       the rows, and on a range of one day each row's views by the hour
//   the same read for the period before  each row's change, and an opened page's figures then
//   the dashboard's read                 the strip's site figures, and the range as the server resolved it
//   the stats of the period before       the strip's changes
// An opened page asks for its own hours (one day only) and its scroll depth, once each, when they are shown.
// ---------------------------------------------------------------------------

/** The pages read's row limit. At it the list holds the busiest pages, and says "500+". */
const PAGES_LIMIT = 500

/** No page-answer values here: the Pages read lists paths, not the events or channels the dashboard's answer lists. */
const NO_PAGE_VALUES: PageValues = {}

function PagesNotAvailable() {
  return <EmptyState icon={<FileText />} title="This page is not available" description="The site owner has not shared it." />
}

export default function PagesListPage({ siteId }: { siteId: string }) {
  const scope = useSiteScope()
  const caps = useMemo(() => dashboardCapabilities(scope), [scope])
  const { data: site } = useSite(siteId)
  const searchParams = useSearchParams()

  useEffect(() => {
    if (site?.domain) document.title = `Pages · ${displayDomain(site)} | Pulse`
  }, [site])

  const dataWindow = useDataWindow(siteId, 'pages')
  const { period, dateRange, periodReady, picker, siteNow } = useUrlDateRange({
    surface: 'pages',
    window: dataWindow,
    timezone: site?.timezone,
    retentionMonths: site?.data_retention_months,
  })
  // 🔴 Never fetch on a period the user did not choose (useUrlDateRange:194).
  const range = fetchableRange(periodReady, dateRange)
  const apiPeriod = serverResolvedPeriod(periodReady, period)

  const [filters, setFilters] = useState<DimensionFilter[]>(() => {
    const raw = caps.filters ? searchParams.get('filters') : null
    // The pages read answers dimension filters. An event condition is the dashboard's and is left behind.
    return raw ? parseFiltersFromURL(raw).filter((f) => f.dimension !== 'event' && !f.dimension.startsWith('event_property:')) : []
  })
  const filtersParam = useMemo(() => serializeFilters(filters), [filters])
  // What an opened page's Scroll depth is split by (ScrollWho.tsx). Held here, over every opened page, as a block's
  // tab is held by its block: the choice is kept from one page to the next and over a trip to Trend.
  const [scrollBy, setScrollBy] = useState<PageScrollBy>('device')
  useEffect(() => {
    const url = new URL(window.location.href)
    if (filtersParam) url.searchParams.set('filters', filtersParam)
    else url.searchParams.delete('filters')
    window.history.replaceState({}, '', url.toString())
  }, [filtersParam])

  const handleFilterApply = useCallback((filter: DimensionFilter, editingIndex: number | null) => {
    setFilters((prev) => {
      if (editingIndex !== null) return prev.map((f, i) => (i === editingIndex ? filter : f))
      const duplicate = prev.some((f) => f.dimension === filter.dimension && f.operator === filter.operator && f.values.join(';') === filter.values.join(';'))
      return duplicate ? prev : [...prev, filter]
    })
  }, [])
  const handleRemoveFilter = useCallback((index: number) => setFilters((prev) => prev.filter((_, i) => i !== index)), [])
  const handleClearFilters = useCallback(() => setFilters([]), [])
  const handleApplySet = useCallback((next: DimensionFilter[]) => setFilters(next), [])
  const fetchSuggestions = useFilterSuggestions(siteId, range.start && range.end ? range : null, filtersParam || undefined, apiPeriod)

  // The dashboard's own rule for a chart's buckets (DashboardSurface): one day is drawn by the hour, and a today
  // younger than three hours by the minute. The rows' bars are hours on a day old enough to be drawn by the hour.
  const oneDay = caps.hourlyBuckets && !!range.start && range.start === range.end
  const youngDay = oneDay && range.start === formatDate(siteNow) && siteNow.getHours() * 60 + siteNow.getMinutes() < 3 * 60
  const hourly = oneDay && !youngDay
  const live = !!site?.timezone && range.end === todayIn(site.timezone)

  const { data, error, isLoading } = usePagesTable(siteId, range.start, range.end, PAGES_LIMIT, filtersParam || undefined, apiPeriod, hourly ? 'hours' : undefined)
  const rows = useMemo(() => data?.pages ?? [], [data])

  // The site's own figures for the strip, and the range the server resolved: the period before follows from it.
  const { data: dashboard } = useDashboard(siteId, range.start, range.end, oneDay ? 'hour' : 'day', filtersParam || undefined, apiPeriod)
  const resolved = resolveDashboardRange(periodReady, dashboard?.date_range, apiPeriod, dateRange)
  const prevRange = useMemo(
    () => (caps.comparison && resolved && period !== 'all' ? previousDateRange(resolved) : null),
    [caps.comparison, resolved, period],
  )
  const { data: prevStats, error: prevStatsError } = useStats(siteId, prevRange?.start ?? '', prevRange?.end ?? '', filtersParam || undefined)
  const { data: prevData, error: prevError } = usePagesTable(siteId, prevRange?.start ?? '', prevRange?.end ?? '', PAGES_LIMIT, filtersParam || undefined)
  // What the page knows of the period before (before.ts): none, on its way, failed, or in hand. Every line about it
  // follows this, so nothing says "no period before" while it loads or after its read failed.
  const beforeRows = beforeState(Boolean(prevRange), prevData, prevError)
  const beforeStats = beforeState(Boolean(prevRange), prevStats, prevStatsError)
  const prevRows = beforeRows === 'ready' ? prevData?.pages : undefined

  const toolbar = (
    <FrameToolbar>
      <div className="hidden flex-1 sm:block" />
      {caps.filters && (
        <>
          <FiltersBox filters={filters} onApply={handleFilterApply} onRemove={handleRemoveFilter} onClearAll={handleClearFilters} pageValues={NO_PAGE_VALUES} />
          <SearchFilter filters={filters} onApply={handleFilterApply} fetchSuggestions={fetchSuggestions} pageValues={NO_PAGE_VALUES} onApplySet={handleApplySet} />
        </>
      )}
      <DateRangePicker {...picker} />
    </FrameToolbar>
  )

  let body: React.ReactNode
  if (error) {
    // A range the server refuses as too large (a 422: over the raw read's budgets) is a limit, said as one, as the
    // opened page's scroll depth says it (ScrollWho). Every other failure is the one a retry can fix.
    body = error instanceof ApiError && error.status === 422
      ? <ErrorCard title="Pages can't be shown for this range" description={filters.length ? 'Choose a shorter range or remove a filter.' : 'Choose a shorter range.'} />
      : <ErrorCard title="Could not load pages" description="The request failed. This is usually temporary." />
  } else if (!periodReady || (isLoading && rows.length === 0)) {
    // `!periodReady` counts as loading, as on the dashboard (DashboardSurface, `showSkeleton`). Until the site's
    // timezone and data window are known there is no range to ask for, and SWR reports isLoading false for a read
    // that was not asked: without this the page drew an EMPTY LIST ("0 pages", "No page was viewed") for as long as
    // those two reads took, then its skeleton, then the list.
    body = (
      <div className="flex flex-col gap-3" aria-hidden="true" data-pages-skeleton="">
        <SkeletonCard className="h-[98px]" />
        <SkeletonCard className="h-[560px]" />
      </div>
    )
  } else if (periodReady && !data) {
    // The request was switched on and there is still no table, no error and nothing in flight: the read was not
    // made, because the scope does not answer it. That is "not available", never an empty list.
    body = <PagesNotAvailable />
  } else {
    const pageFilters = (path: string) => serializeFilters([...filters, { dimension: 'page', operator: 'is', values: [path] }])
    body = (
      <div className="flex flex-col gap-3">
        <PagesStrip rows={rows} prevRows={prevRows} stats={dashboard?.stats} prevStats={prevRange ? prevStats : undefined} limit={PAGES_LIMIT} beforeRows={beforeRows} beforeStats={beforeStats} />
        <PagesList
          rows={rows}
          prevRows={prevRows}
          before={beforeRows}
          limit={PAGES_LIMIT}
          start={range.start}
          prevStart={prevRange?.start}
          live={live}
          hourly={hourly}
          nowHour={live ? siteNow.getHours() : undefined}
          domain={site?.domain}
          renderScroll={(path) => (
            <ScrollWho siteId={siteId} path={path} start={range.start} end={range.end} apiPeriod={apiPeriod} filters={filtersParam || undefined} by={scrollBy} onBy={setScrollBy} />
          )}
          // A range of one day (Today, Yesterday, a day from the calendar): the opened page draws its HOURS, as the
          // dashboard's chart draws a day, and minutes while today is younger than three hours.
          renderHours={oneDay ? (path) => (
            <PageHours
              siteId={siteId}
              day={range.start}
              apiPeriod={apiPeriod}
              filters={pageFilters(path)}
              prevDay={prevRange?.start}
              live={live}
              bucket={youngDay ? 'minute' : 'hour'}
              floor={dataWindow?.from ?? null}
            />
          ) : undefined}
          hoursCompare={hourly && Boolean(prevRange)}
          dashboardHref={caps.filters ? (path) => {
            // The dashboard for the same range, filtered to this page: the address this page has, less its own words.
            const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search)
            for (const word of LIST_PARAMS) params.delete(word)
            params.set('filters', pageFilters(path))
            return scopeHref(scope, 'dashboard', `?${params.toString()}`)
          } : undefined}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6" data-pages-surface="list">
      {toolbar}
      {body}
    </div>
  )
}
