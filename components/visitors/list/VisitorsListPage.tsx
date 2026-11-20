'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Select, Switcher } from '@ciphera-net/facet'
import DateRangePicker from '@/components/ui/DateRangePicker'
import FrameToolbar from '@/components/dashboard/FrameToolbar'
import RealtimeOrb from '@/components/dashboard/RealtimeOrb'
import SearchFilter from '@/components/dashboard/filter/search/SearchFilter'
import FiltersBox from '@/components/dashboard/filter/search/FiltersBox'
import { TermInfoTip } from '@/components/dashboard/MetricInfoTip'
import { useCardPage } from '@/components/dashboard/CardPager'
import { ErrorCard } from '@/components/ui/ErrorCard'
import { SkeletonCard } from '@/components/skeletons'
import { VisitorsOffRoom } from '@/components/visitors/VisitorsOffRoom'
import { useUrlDateRange } from '@/lib/hooks/useUrlDateRange'
import { useRealtimeToggle } from '@/lib/hooks/useRealtimeToggle'
import { useFilterSuggestions } from '@/lib/hooks/useFilterSuggestions'
import { REALTIME_EMPTY_LINE, REALTIME_MODES, REALTIME_ROLLING_MINUTES } from '@/lib/dashboard/realtimeRange'
import { fetchableRange, serverResolvedPeriod } from '@/lib/dashboard/resolveRange'
import { EVENT_FILTERS_FLAG, parseFiltersFromURL, readEventNameAsEvent, serializeFilters, type DimensionFilter } from '@/lib/filters'
import { useFeature } from '@/lib/features'
import { useDataWindow, useSite, useVisitorsList, useVisitorsSummary } from '@/lib/swr/dashboard'
import { scopeHref, useSiteScope } from '@/lib/scope/SiteScope'
import { FRAME_CARD_NAME, FRAME_SURFACE } from '@/lib/dashboard/frameClasses'
import { siteDaysCaption } from '@/lib/utils/timezones'
import { displayDomain } from '@/lib/utils/displayDomain'
import { formatNumber } from '@/lib/utils/format'
import { SITE_TIMEZONE_FALLBACK } from '@/lib/visitors/format'
import type { PageValues } from '@/components/dashboard/filter/search/values'
import type { Sort } from '@/components/dashboard/SortHead'
import type { VisitorOnly, VisitorRange } from '@/lib/api/visitors'
import VisitorStrip from './VisitorStrip'
import VisitorsList, { FIRST_SORT, isKey, PER_PAGE, PHONE_OPTIONS, SERVER_SORT, type Key } from './VisitorsList'
import type { VisitorLinks } from './OpenedVisitor'
import { NAME_AN_EVENT_HREF } from './day'

// ---------------------------------------------------------------------------
// The new Visitors page (look C, rulings R98 to R116, 18 to 20-11-2026; in beta behind `new-visitors`, lib/betas.ts;
// plan Pulse/docs/plans/18-11-2026-visitors-page-overhaul-plan.md). From the top: the dashboard's toolbar (the realtime
// orb, the Filter, its box and the date control), a strip of four figures against the period before, and the block:
// every visitor in one list with their day as marks, the quick tabs over it, a visitor opened in place.
//
// Its reads, each asked once: the list's page (`include=day`: each row's day and own events) under the filter and the
// tab, sorted and paged by the server; the strip (the range and the period before, under the filter, never the tab).
// An opened visitor asks for its visits and its profile.
// ---------------------------------------------------------------------------

/** No page-answer values here: the visitors read lists people, not the events or channels the dashboard's answer lists. */
const NO_PAGE_VALUES: PageValues = {}

type Show = 'all' | 'converted' | 'went-on' | 'one-page'
const SHOWS: readonly Show[] = ['all', 'converted', 'went-on', 'one-page']
const isShow = (v: unknown): v is Show => SHOWS.includes(v as Show)
/** The server's word for each quick tab. */
const ONLY: Record<Show, VisitorOnly | undefined> = { all: undefined, converted: 'converted', 'went-on': 'went_on', 'one-page': 'one_page' }

/**
 * The quick tabs over the list (R112): the dashboard blocks' orange tabs. "Left after one page" is "One page" where the
 * block has under 440 px, so the four fit a phone.
 */
const SHOW_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'converted', label: 'Converted' },
  { value: 'went-on', label: 'Went on' },
  {
    value: 'one-page',
    label: (
      <>
        <span className="cq-[440px]:hidden">One page</span>
        <span className="hidden cq-[440px]:inline">Left after one page</span>
      </>
    ),
  },
]

/** What a tab says when it has nobody in the period. */
const NOBODY: Record<Show, string> = {
  all: 'No visitors in this period.',
  converted: 'No visitor converted in this period.',
  'went-on': 'No visitor went past their first page in this period.',
  'one-page': 'Every visitor went past their first page in this period.',
}

/** The words this page keeps in the address. The links out leave them behind. */
const PAGE_PARAMS = ['filters', 'show', 'col'] as const

function isToggleOff(error: unknown): boolean {
  // A 403 here is the site's own visitor_views_enabled toggle, a state the page draws (the enable room). Any other 403
  // is an access problem, so the code is checked as well as the status.
  const e = error as { status?: number; data?: { error?: string } } | undefined
  return e?.status === 403 && e?.data?.error === 'visitor_views_disabled'
}

/** A read the server refused as too large (a 422): a limit, said as one (the Pages page's device), never "try again". */
const refusedAsTooLarge = (error: unknown): boolean => (error as { status?: number } | undefined)?.status === 422

export default function VisitorsListPage({ siteId }: { siteId: string }) {
  const scope = useSiteScope()
  const asked = useSearchParams()
  const { data: site, mutate: refreshSite } = useSite(siteId)

  useEffect(() => {
    if (site?.domain) document.title = `Visitors · ${displayDomain(site)} | Pulse`
  }, [site])

  // The range as today's page builds it: the visitors data window, realtime as the dashboard's mode from the orb.
  const dataWindow = useDataWindow(siteId, 'visitors')
  const urlRange = useUrlDateRange({
    surface: 'visitors',
    window: dataWindow,
    timezone: site?.timezone,
    modes: REALTIME_MODES,
    rollingMinutes: REALTIME_ROLLING_MINUTES,
    retentionMonths: site?.data_retention_months,
    daysCaption: siteDaysCaption(site?.timezone),
  })
  const { period, dateRange, periodReady, rollingMinutes, picker } = urlRange
  const { isLive: live, toggle: toggleRealtime } = useRealtimeToggle(urlRange)
  const allToken = serverResolvedPeriod(periodReady, period)
  const range = useMemo<VisitorRange>(
    () => (rollingMinutes != null ? { minutes: rollingMinutes } : { startDate: dateRange.start, endDate: dateRange.end, period: allToken }),
    [rollingMinutes, dateRange.start, dateRange.end, allToken],
  )

  // The dashboard's filter: dimensions and, with the event-filters beta, events (the server answers both).
  const eventFilters = useFeature(EVENT_FILTERS_FLAG) === true
  const [filters, setFilters] = useState<DimensionFilter[]>(() => {
    const raw = asked.get('filters')
    return raw ? parseFiltersFromURL(raw) : []
  })
  useEffect(() => {
    if (eventFilters) setFilters((prev) => readEventNameAsEvent(prev))
  }, [eventFilters])
  const filtersParam = useMemo(() => serializeFilters(filters), [filters])
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
  const suggestionRange = fetchableRange(periodReady, dateRange)
  const fetchSuggestions = useFilterSuggestions(siteId, suggestionRange.start && suggestionRange.end ? suggestionRange : null, filtersParam || undefined, allToken)

  // The quick tab and the phone's column, kept in the address as the Pages page keeps its own.
  const [show, setShow] = useState<Show>(() => {
    const word = asked.get('show')
    return isShow(word) ? word : 'all'
  })
  const [phone, setPhone] = useState<Key>(() => {
    const word = asked.get('col')
    return isKey(word) ? word : 'last_seen'
  })
  const [sort, setSort] = useState<Sort<Key>>(FIRST_SORT)
  useEffect(() => {
    const url = new URL(window.location.href)
    for (const word of PAGE_PARAMS) url.searchParams.delete(word)
    if (filtersParam) url.searchParams.set('filters', filtersParam)
    if (show !== 'all') url.searchParams.set('show', show)
    if (phone !== 'last_seen') url.searchParams.set('col', phone)
    window.history.replaceState({}, '', url.toString())
  }, [filtersParam, show, phone])

  // A new range, filter, tab or order starts the list on its first page (the blocks' own rule: useCardPage).
  const listKey = `${rollingMinutes ?? ''}|${dateRange.start}|${dateRange.end}|${allToken ?? ''}|${filtersParam}|${show}`
  const [total, setTotal] = useState(0)
  const [page, setPage] = useCardPage(`${listKey}|${sort.key}.${sort.dir}`, Math.max(1, Math.ceil(total / PER_PAGE)))

  const list = useVisitorsList(siteId, range, {
    sort: SERVER_SORT[sort.key],
    order: sort.dir,
    page,
    pageSize: PER_PAGE,
    filters: filtersParam || undefined,
    only: ONLY[show],
    // 🔴 Never on a period the reader did not choose (useUrlDateRange): the first render's placeholder is not asked.
    enabled: periodReady,
  })
  const summary = useVisitorsSummary(siteId, range, filtersParam || undefined, periodReady)
  const listTotal = list.data?.total
  useEffect(() => {
    if (listTotal != null) setTotal(listTotal)
  }, [listTotal])

  const siteTimezone = list.data?.site_timezone || site?.timezone || SITE_TIMEZONE_FALLBACK

  // The links an opened visitor offers: the same range, the page's own words left behind.
  const links = useMemo<VisitorLinks>(() => {
    const base = () => {
      const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search)
      for (const word of PAGE_PARAMS) params.delete(word)
      return params
    }
    return {
      dashboard: (f) => {
        const params = base()
        params.set('filters', serializeFilters(f))
        return scopeHref(scope, 'dashboard', `?${params.toString()}`)
      },
      journeys: (entry) => {
        const params = base()
        params.set('pin', `0:${entry}`)
        return scopeHref(scope, 'journeys', `?${params.toString()}`)
      },
      visitor: (key) => {
        const params = base().toString()
        return `/sites/${siteId}/visitors/${encodeURIComponent(key)}${params ? `?${params}` : ''}`
      },
    }
  }, [scope, siteId])

  if (site && site.visitor_views_enabled === false) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 pb-8 pt-6 sm:px-6" data-visitors-surface="list">
        <VisitorsOffRoom site={site} onEnabled={() => refreshSite()} />
      </div>
    )
  }
  if (list.error && isToggleOff(list.error) && site) {
    // The site row says on, the API says off (a stale copy after it was switched off in another tab): trust the API.
    return (
      <div className="mx-auto w-full max-w-7xl px-4 pb-8 pt-6 sm:px-6" data-visitors-surface="list">
        <VisitorsOffRoom site={site} onEnabled={() => refreshSite()} />
      </div>
    )
  }

  const rows = list.data?.visitors ?? []
  const activeNow = list.data?.active_now ?? 0
  const visits = show === 'all' && summary.data ? summary.data.current.visits : null

  const toolbar = (
    <FrameToolbar>
      <RealtimeOrb count={activeNow} live={live} onToggle={toggleRealtime} />
      <div className="hidden flex-1 sm:block" />
      <FiltersBox filters={filters} onApply={handleFilterApply} onRemove={handleRemoveFilter} onClearAll={handleClearFilters} pageValues={NO_PAGE_VALUES} />
      <SearchFilter filters={filters} onApply={handleFilterApply} fetchSuggestions={fetchSuggestions} pageValues={NO_PAGE_VALUES} onApplySet={handleApplySet} eventFilters={eventFilters} />
      <DateRangePicker {...picker} />
    </FrameToolbar>
  )

  let listBody: React.ReactNode
  if (list.error) {
    listBody = refusedAsTooLarge(list.error)
      ? <ErrorCard title="Visitors can't be shown for this range" description={filters.length ? 'Choose a shorter range or remove a filter.' : 'Choose a shorter range.'} />
      : <ErrorCard title="Couldn't load visitors" description="The visitor list didn't come back. Try again." />
  } else if (!list.data) {
    listBody = (
      <div className="space-y-2" aria-hidden="true" data-visitors-skeleton="">
        {Array.from({ length: 8 }, (_, i) => <SkeletonCard key={i} className="h-9" />)}
      </div>
    )
  } else if (rows.length === 0) {
    listBody = (
      <p className="py-10 text-center text-sm text-neutral-500" data-visitors-nobody={show}>
        {show === 'converted' && summary.data?.named_events === 0 ? (
          <>
            No named events yet.{' '}
            <Link href={NAME_AN_EVENT_HREF} className="text-neutral-300 underline decoration-neutral-600 underline-offset-2 hover:text-white" data-name-an-event="">
              Name an event to count conversions
            </Link>
            .
          </>
        ) : live && show === 'all' ? REALTIME_EMPTY_LINE : NOBODY[show]}
      </p>
    )
  } else {
    listBody = (
      <VisitorsList
        // A new list (range, filter, tab) starts with its first visitor open: keyed by the list the rows SHOWN belong
        // to, so a tab pressed while its rows load does not run the old rows' entrance first.
        key={list.data.listOf}
        siteId={siteId}
        rows={rows}
        total={list.data.total}
        page={page}
        arrival={list.data.pageOf}
        onPage={setPage}
        sort={sort}
        onSort={setSort}
        phone={phone}
        range={range}
        siteTimezone={siteTimezone}
        links={links}
        onFilter={setFilters}
      />
    )
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pb-8 sm:px-6" data-visitors-surface="list">
      {toolbar}
      {!periodReady ? (
        <div className="flex flex-col gap-3" aria-hidden="true" data-visitors-skeleton="">
          <SkeletonCard className="h-[98px]" />
          <SkeletonCard className="h-[560px]" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <VisitorStrip summary={summary.data} failed={Boolean(summary.error)} />
          <section className={`${FRAME_SURFACE} min-w-0 p-6 [container-type:inline-size]`} data-visitors-block="">
            <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="flex items-center gap-1.5">
                <h2 className={FRAME_CARD_NAME}>Visitors</h2>
                <TermInfoTip term="visitor_identity" />
              </span>
              <span className="me-auto text-[11px] tabular-nums text-neutral-500" data-visitors-count="">
                {list.data
                  ? `${formatNumber(list.data.total)} ${list.data.total === 1 ? 'visitor' : 'visitors'}${visits != null ? `, ${formatNumber(visits)} ${visits === 1 ? 'visit' : 'visits'}` : ''}`
                  : null}
              </span>
              {/* The narrowest list has room for one number column; this picks it (the Pages page's menu). */}
              <div className="cq-[440px]:hidden" data-phone-column="">
                <Select aria-label="The column to show" options={PHONE_OPTIONS} value={phone} onChange={(v) => { if (isKey(v)) setPhone(v) }} className="h-8 min-w-[8.5rem] text-xs" />
              </div>
              <div className="w-full cq-[640px]:w-auto" data-visitors-tabs="">
                <Switcher size="sm" tone="solid" aria-label="Which visitors to list" options={SHOW_OPTIONS} value={show} onChange={(v) => { if (isShow(v)) setShow(v) }} />
              </div>
            </div>
            {listBody}
          </section>
        </div>
      )}
    </div>
  )
}
